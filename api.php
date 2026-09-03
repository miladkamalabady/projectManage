<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

try {
    start_secure_session();
    $user = require_user();
    $pdo = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $tasks = $pdo->query(
            'SELECT t.*, u.display_name AS assigned_name
             FROM tasks t LEFT JOIN users u ON u.id = t.assigned_user_id
             ORDER BY CAST(SUBSTRING_INDEX(t.wbs, ".", 1) AS UNSIGNED),
                      CAST(SUBSTRING_INDEX(t.wbs, ".", -1) AS UNSIGNED), t.id'
        )->fetchAll();

        $issues = $pdo->query(
            'SELECT i.*, t.title AS task_title, reporter.display_name AS reporter_name,
                    assignee.display_name AS assignee_name
             FROM issues i
             LEFT JOIN tasks t ON t.id = i.task_id
             JOIN users reporter ON reporter.id = i.reported_by
             LEFT JOIN users assignee ON assignee.id = i.assigned_to
             ORDER BY FIELD(i.status, "open", "in_progress", "resolved", "closed"), i.created_at DESC'
        )->fetchAll();

        $meetings = $pdo->query(
            'SELECT m.*, u.display_name AS creator_name
             FROM meetings m JOIN users u ON u.id = m.created_by
             ORDER BY m.meeting_date DESC'
        )->fetchAll();

        $users = [];
        if ($user['role'] === 'manager') {
            $users = $pdo->query(
                'SELECT id, email, display_name, role, active, created_at FROM users ORDER BY active DESC, display_name'
            )->fetchAll();
        }

        $logs = $pdo->query(
            'SELECT l.*, u.display_name FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 12'
        )->fetchAll();

        json_response([
            'ok' => true,
            'data' => [
                'tasks' => $tasks,
                'issues' => $issues,
                'meetings' => $meetings,
                'users' => $users,
                'logs' => $logs,
            ],
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['ok' => false, 'error' => 'متد درخواست پشتیبانی نمی‌شود.'], 405);
    }

    verify_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) {
        json_response(['ok' => false, 'error' => 'بدنه درخواست معتبر نیست.'], 422);
    }
    $action = (string) ($input['action'] ?? '');

    if ($action === 'update_task') {
        require_role($user, ['manager', 'contractor']);
        $id = (string) ($input['id'] ?? '');
        $status = (string) ($input['status'] ?? 'todo');
        $progress = max(0, min(100, (int) ($input['progress'] ?? 0)));
        $deadline = trim((string) ($input['contractor_deadline'] ?? '')) ?: null;
        $notes = trim((string) ($input['notes'] ?? ''));
        if (!in_array($status, ['todo', 'in_progress', 'review', 'done', 'blocked'], true)) {
            json_response(['ok' => false, 'error' => 'وضعیت انتخاب‌شده معتبر نیست.'], 422);
        }
        if ($deadline !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) {
            json_response(['ok' => false, 'error' => 'تاریخ ددلاین معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare(
            'UPDATE tasks SET status = ?, progress = ?, contractor_deadline = ?, notes = ? WHERE id = ?'
        );
        $statement->execute([$status, $progress, $deadline, $notes, $id]);
        log_activity($pdo, (int) $user['id'], 'task', $id, 'update', [
            'status' => $status,
            'progress' => $progress,
            'deadline' => $deadline,
        ]);
        json_response(['ok' => true, 'message' => 'فعالیت با موفقیت به‌روزرسانی شد.']);
    }

    if ($action === 'approve_task') {
        $id = (string) ($input['id'] ?? '');
        $decision = (string) ($input['decision'] ?? 'pending');
        $kind = (string) ($input['kind'] ?? '');
        if (!in_array($decision, ['pending', 'approved', 'rejected'], true)) {
            json_response(['ok' => false, 'error' => 'تصمیم تأیید معتبر نیست.'], 422);
        }
        if ($kind === 'supervisor') {
            require_role($user, ['manager', 'supervisor']);
            $field = 'supervisor_approval';
        } elseif ($kind === 'operator') {
            require_role($user, ['manager', 'operator']);
            $field = 'operator_approval';
        } else {
            json_response(['ok' => false, 'error' => 'نوع تأیید معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare("UPDATE tasks SET {$field} = ? WHERE id = ?");
        $statement->execute([$decision, $id]);
        log_activity($pdo, (int) $user['id'], 'task', $id, $kind . '_approval', ['decision' => $decision]);
        json_response(['ok' => true, 'message' => 'نظر تأیید ثبت شد.']);
    }

    if ($action === 'create_issue') {
        require_role($user, ['manager', 'contractor', 'supervisor', 'operator']);
        $title = trim((string) ($input['title'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $taskId = trim((string) ($input['task_id'] ?? '')) ?: null;
        $severity = (string) ($input['severity'] ?? 'medium');
        $dueDate = trim((string) ($input['due_date'] ?? '')) ?: null;
        if ($title === '' || $description === '' || !in_array($severity, ['low', 'medium', 'high', 'critical'], true)) {
            json_response(['ok' => false, 'error' => 'عنوان، شرح و شدت اشکال را کامل کنید.'], 422);
        }
        if ($dueDate !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate)) {
            json_response(['ok' => false, 'error' => 'تاریخ مهلت رفع معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare(
            'INSERT INTO issues (task_id, title, description, severity, reported_by, due_date) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$taskId, $title, $description, $severity, (int) $user['id'], $dueDate]);
        $id = (string) $pdo->lastInsertId();
        log_activity($pdo, (int) $user['id'], 'issue', $id, 'create', ['task_id' => $taskId]);
        json_response(['ok' => true, 'message' => 'اشکال جدید ثبت شد.']);
    }

    if ($action === 'update_issue') {
        require_role($user, ['manager', 'contractor', 'supervisor', 'operator']);
        $id = (int) ($input['id'] ?? 0);
        $status = (string) ($input['status'] ?? '');
        if (!in_array($status, ['open', 'in_progress', 'resolved', 'closed'], true)) {
            json_response(['ok' => false, 'error' => 'وضعیت اشکال معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare('UPDATE issues SET status = ? WHERE id = ?');
        $statement->execute([$status, $id]);
        log_activity($pdo, (int) $user['id'], 'issue', (string) $id, 'status_change', ['status' => $status]);
        json_response(['ok' => true, 'message' => 'وضعیت اشکال تغییر کرد.']);
    }

    if ($action === 'delete_issue') {
        require_role($user, ['manager']);
        $id = (int) ($input['id'] ?? 0);
        if ($id < 1) {
            json_response(['ok' => false, 'error' => 'شناسه اشکال معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare('DELETE FROM issues WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            json_response(['ok' => false, 'error' => 'رکورد اشکال پیدا نشد.'], 404);
        }
        log_activity($pdo, (int) $user['id'], 'issue', (string) $id, 'delete');
        json_response(['ok' => true, 'message' => 'رکورد اشکال حذف شد.']);
    }

    if ($action === 'create_meeting') {
        require_role($user, ['manager', 'supervisor', 'operator']);
        $title = trim((string) ($input['title'] ?? ''));
        $date = trim((string) ($input['meeting_date'] ?? ''));
        $participants = trim((string) ($input['participants'] ?? ''));
        $decisions = trim((string) ($input['decisions'] ?? ''));
        $actions = trim((string) ($input['actions'] ?? ''));
        if ($title === '' || $date === '' || $participants === '' || $decisions === '') {
            json_response(['ok' => false, 'error' => 'اطلاعات اصلی جلسه را کامل کنید.'], 422);
        }
        $statement = $pdo->prepare(
            'INSERT INTO meetings (title, meeting_date, participants, decisions, actions, created_by) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$title, str_replace('T', ' ', $date), $participants, $decisions, $actions, (int) $user['id']]);
        $id = (string) $pdo->lastInsertId();
        log_activity($pdo, (int) $user['id'], 'meeting', $id, 'create');
        json_response(['ok' => true, 'message' => 'صورت‌جلسه ثبت شد.']);
    }

    if ($action === 'create_user') {
        require_role($user, ['manager']);
        $name = trim((string) ($input['display_name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $role = (string) ($input['role'] ?? 'viewer');
        $roles = ['manager', 'contractor', 'supervisor', 'operator', 'viewer'];
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($password) < 10 || !in_array($role, $roles, true)) {
            json_response(['ok' => false, 'error' => 'اطلاعات کاربر یا رمز عبور معتبر نیست.'], 422);
        }
        try {
            $statement = $pdo->prepare(
                'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
            );
            $statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, $role]);
        } catch (PDOException $exception) {
            if ((string) $exception->getCode() === '23000') {
                json_response(['ok' => false, 'error' => 'این ایمیل قبلاً ثبت شده است.'], 409);
            }
            throw $exception;
        }
        $id = (string) $pdo->lastInsertId();
        log_activity($pdo, (int) $user['id'], 'user', $id, 'create', ['role' => $role]);
        json_response(['ok' => true, 'message' => 'کاربر جدید ایجاد شد.']);
    }

    json_response(['ok' => false, 'error' => 'عملیات درخواست‌شده شناخته نشد.'], 404);
} catch (Throwable $exception) {
    error_log($exception->__toString());
    json_response(['ok' => false, 'error' => 'خطای داخلی رخ داد. جزئیات در گزارش سرور ثبت شد.'], 500);
}
