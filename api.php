<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

function accessible_projects(PDO $pdo, int $userId): array
{
    $statement = $pdo->prepare(
        'SELECT p.*, pu.access_role
         FROM projects p
         JOIN project_users pu ON pu.project_id = p.id
         WHERE pu.user_id = ?
         ORDER BY FIELD(p.status, "active", "paused", "completed", "archived"), p.updated_at DESC'
    );
    $statement->execute([$userId]);
    return $statement->fetchAll();
}

function project_context(PDO $pdo, int $userId, int $projectId): array
{
    $statement = $pdo->prepare(
        'SELECT p.*, pu.access_role
         FROM projects p
         JOIN project_users pu ON pu.project_id = p.id
         WHERE p.id = ? AND pu.user_id = ?'
    );
    $statement->execute([$projectId, $userId]);
    $project = $statement->fetch();
    if (!$project) {
        json_response(['ok' => false, 'error' => 'به این پروژه دسترسی ندارید.'], 403);
    }
    return $project;
}

function require_project_manager(array $project): void
{
    if ($project['access_role'] !== 'project_manager') {
        json_response(['ok' => false, 'error' => 'فقط مدیر این پروژه اجازه انجام این عملیات را دارد.'], 403);
    }
}

function require_project_editor(array $project): void
{
    if (!in_array($project['access_role'], ['project_manager', 'editor'], true)) {
        json_response(['ok' => false, 'error' => 'دسترسی شما به این پروژه فقط برای مشاهده است.'], 403);
    }
}

function valid_iso_date(?string $date): bool
{
    return $date === null || preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1;
}

function next_task_id(PDO $pdo, array $project): string
{
    $prefix = strtoupper((string) $project['code']);
    $statement = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE project_id = ?');
    $statement->execute([(int) $project['id']]);
    $number = (int) $statement->fetchColumn() + 1;
    $exists = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE id = ?');
    do {
        $candidate = $prefix . '-' . str_pad((string) $number, 3, '0', STR_PAD_LEFT);
        $exists->execute([$candidate]);
        $number++;
    } while ((int) $exists->fetchColumn() > 0);
    return $candidate;
}

function ensure_last_project_manager(PDO $pdo, int $projectId, int $userId, string $nextAccess = ''): void
{
    $current = $pdo->prepare(
        "SELECT access_role FROM project_users WHERE project_id = ? AND user_id = ?"
    );
    $current->execute([$projectId, $userId]);
    if ($current->fetchColumn() !== 'project_manager' || $nextAccess === 'project_manager') {
        return;
    }
    $count = $pdo->prepare(
        "SELECT COUNT(*) FROM project_users WHERE project_id = ? AND access_role = 'project_manager'"
    );
    $count->execute([$projectId]);
    if ((int) $count->fetchColumn() <= 1) {
        json_response(['ok' => false, 'error' => 'هر پروژه باید حداقل یک مدیر پروژه داشته باشد.'], 422);
    }
}

try {
    start_secure_session();
    $user = require_user();
    $pdo = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $projects = accessible_projects($pdo, (int) $user['id']);
        $requestedProjectId = (int) ($_GET['project_id'] ?? 0);
        $selected = null;
        foreach ($projects as $candidate) {
            if ($requestedProjectId > 0 && (int) $candidate['id'] === $requestedProjectId) {
                $selected = $candidate;
                break;
            }
        }
        if ($selected === null && $projects) {
            $selected = $projects[0];
        }

        if ($selected === null) {
            json_response([
                'ok' => true,
                'data' => [
                    'projects' => [],
                    'current_project' => null,
                    'project_access' => null,
                    'can_create_project' => $user['role'] === 'manager',
                    'tasks' => [],
                    'issues' => [],
                    'meetings' => [],
                    'users' => [],
                    'project_members' => [],
                    'logs' => [],
                ],
            ]);
        }

        $projectId = (int) $selected['id'];
        $_SESSION['project_id'] = $projectId;

        $taskStatement = $pdo->prepare(
            'SELECT t.*, u.display_name AS assigned_name
             FROM tasks t LEFT JOIN users u ON u.id = t.assigned_user_id
             WHERE t.project_id = ?
             ORDER BY CAST(SUBSTRING_INDEX(t.wbs, ".", 1) AS UNSIGNED),
                      CAST(SUBSTRING_INDEX(t.wbs, ".", -1) AS UNSIGNED), t.id'
        );
        $taskStatement->execute([$projectId]);
        $tasks = $taskStatement->fetchAll();

        $issueStatement = $pdo->prepare(
            'SELECT i.*, t.title AS task_title, reporter.display_name AS reporter_name,
                    assignee.display_name AS assignee_name
             FROM issues i
             LEFT JOIN tasks t ON t.id = i.task_id
             JOIN users reporter ON reporter.id = i.reported_by
             LEFT JOIN users assignee ON assignee.id = i.assigned_to
             WHERE i.project_id = ?
             ORDER BY FIELD(i.status, "open", "in_progress", "resolved", "closed"), i.created_at DESC'
        );
        $issueStatement->execute([$projectId]);
        $issues = $issueStatement->fetchAll();

        $meetingStatement = $pdo->prepare(
            'SELECT m.*, u.display_name AS creator_name
             FROM meetings m JOIN users u ON u.id = m.created_by
             WHERE m.project_id = ? ORDER BY m.meeting_date DESC'
        );
        $meetingStatement->execute([$projectId]);
        $meetings = $meetingStatement->fetchAll();

        $users = [];
        $projectMembers = [];
        if ($selected['access_role'] === 'project_manager') {
            $users = $pdo->query(
                'SELECT id, email, display_name, role, active, created_at
                 FROM users WHERE active = 1 ORDER BY display_name'
            )->fetchAll();
            $memberStatement = $pdo->prepare(
                'SELECT u.id, u.email, u.display_name, u.role, pu.access_role
                 FROM project_users pu JOIN users u ON u.id = pu.user_id
                 WHERE pu.project_id = ? ORDER BY FIELD(pu.access_role, "project_manager", "editor", "viewer"), u.display_name'
            );
            $memberStatement->execute([$projectId]);
            $projectMembers = $memberStatement->fetchAll();
        }

        $logFilter = $user['role'] === 'manager'
            ? '(l.project_id = ? OR l.project_id IS NULL)'
            : "l.project_id = ? AND l.entity_type NOT IN ('system', 'project', 'project_member', 'user')";
        $logStatement = $pdo->prepare(
            "SELECT l.*, u.display_name FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             WHERE {$logFilter} ORDER BY l.created_at DESC LIMIT 12"
        );
        $logStatement->execute([$projectId]);
        $logs = $logStatement->fetchAll();

        json_response([
            'ok' => true,
            'data' => [
                'projects' => $projects,
                'current_project' => $selected,
                'project_access' => $selected['access_role'],
                'can_create_project' => $user['role'] === 'manager',
                'tasks' => $tasks,
                'issues' => $issues,
                'meetings' => $meetings,
                'users' => $users,
                'project_members' => $projectMembers,
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

    if ($action === 'change_password') {
        $currentPassword = (string) ($input['current_password'] ?? '');
        $newPassword = (string) ($input['new_password'] ?? '');
        $confirmPassword = (string) ($input['confirm_password'] ?? '');
        if (mb_strlen($newPassword) < 10) {
            json_response(['ok' => false, 'error' => 'رمز عبور جدید باید حداقل ۱۰ نویسه داشته باشد.'], 422);
        }
        if (!hash_equals($newPassword, $confirmPassword)) {
            json_response(['ok' => false, 'error' => 'رمز عبور جدید و تکرار آن یکسان نیستند.'], 422);
        }
        $passwordStatement = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? AND active = 1');
        $passwordStatement->execute([(int) $user['id']]);
        $currentHash = (string) ($passwordStatement->fetchColumn() ?: '');
        if ($currentHash === '' || !password_verify($currentPassword, $currentHash)) {
            json_response(['ok' => false, 'error' => 'رمز عبور فعلی صحیح نیست.'], 422);
        }
        if (password_verify($newPassword, $currentHash)) {
            json_response(['ok' => false, 'error' => 'رمز عبور جدید نباید با رمز فعلی یکسان باشد.'], 422);
        }
        $updatePassword = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $updatePassword->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $user['id']]);
        session_regenerate_id(true);
        log_activity($pdo, (int) $user['id'], 'user', (string) $user['id'], 'change_password');
        json_response(['ok' => true, 'message' => 'رمز عبور با موفقیت تغییر کرد.']);
    }

    if ($action === 'create_project') {
        require_role($user, ['manager']);
        $name = trim((string) ($input['name'] ?? ''));
        $code = strtoupper(trim((string) ($input['code'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));
        $startDate = trim((string) ($input['start_date'] ?? '')) ?: null;
        $endDate = trim((string) ($input['end_date'] ?? '')) ?: null;
        if ($name === '' || preg_match('/^[A-Z0-9_-]{2,20}$/', $code) !== 1) {
            json_response(['ok' => false, 'error' => 'نام پروژه و کد لاتین ۲ تا ۲۰ نویسه‌ای را وارد کنید.'], 422);
        }
        if (!valid_iso_date($startDate) || !valid_iso_date($endDate)) {
            json_response(['ok' => false, 'error' => 'تاریخ پروژه معتبر نیست.'], 422);
        }
        try {
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                "INSERT INTO projects (name, code, description, status, start_date, end_date, created_by)
                 VALUES (?, ?, ?, 'active', ?, ?, ?)"
            );
            $statement->execute([$name, $code, $description, $startDate, $endDate, (int) $user['id']]);
            $projectId = (int) $pdo->lastInsertId();
            $member = $pdo->prepare(
                "INSERT INTO project_users (project_id, user_id, access_role) VALUES (?, ?, 'project_manager')"
            );
            $member->execute([$projectId, (int) $user['id']]);
            log_activity($pdo, (int) $user['id'], 'project', (string) $projectId, 'create', ['name' => $name], $projectId);
            $pdo->commit();
            json_response(['ok' => true, 'message' => 'پروژه جدید ایجاد شد.', 'project_id' => $projectId]);
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ((string) $exception->getCode() === '23000') {
                json_response(['ok' => false, 'error' => 'کد پروژه تکراری است.'], 409);
            }
            throw $exception;
        }
    }

    $projectId = (int) ($input['project_id'] ?? ($_SESSION['project_id'] ?? 0));
    if ($projectId < 1) {
        json_response(['ok' => false, 'error' => 'ابتدا یک پروژه را انتخاب کنید.'], 422);
    }
    $project = project_context($pdo, (int) $user['id'], $projectId);

    if ($action === 'update_project') {
        require_project_manager($project);
        $name = trim((string) ($input['name'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $status = (string) ($input['status'] ?? 'active');
        if ($name === '' || !in_array($status, ['active', 'paused', 'completed', 'archived'], true)) {
            json_response(['ok' => false, 'error' => 'نام یا وضعیت پروژه معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare('UPDATE projects SET name = ?, description = ?, status = ? WHERE id = ?');
        $statement->execute([$name, $description, $status, $projectId]);
        log_activity($pdo, (int) $user['id'], 'project', (string) $projectId, 'update', ['status' => $status], $projectId);
        json_response(['ok' => true, 'message' => 'تنظیمات پروژه ذخیره شد.']);
    }

    if ($action === 'create_task') {
        require_project_manager($project);
        $title = trim((string) ($input['title'] ?? ''));
        $wbs = trim((string) ($input['wbs'] ?? ''));
        $domain = trim((string) ($input['domain'] ?? ''));
        $criteria = trim((string) ($input['acceptance_criteria'] ?? ''));
        $priority = (string) ($input['priority'] ?? 'متوسط');
        $ownerType = trim((string) ($input['owner_type'] ?? 'پیمانکار'));
        $sourcePage = trim((string) ($input['source_page'] ?? '')) ?: '-';
        if ($title === '' || $wbs === '' || $domain === '' || $criteria === '') {
            json_response(['ok' => false, 'error' => 'عنوان، WBS، حوزه و معیار پذیرش را کامل کنید.'], 422);
        }
        if (!in_array($priority, ['کم', 'متوسط', 'بالا', 'بحرانی'], true)) {
            json_response(['ok' => false, 'error' => 'اولویت فعالیت معتبر نیست.'], 422);
        }
        $id = next_task_id($pdo, $project);
        $statement = $pdo->prepare(
            'INSERT INTO tasks
             (id, project_id, wbs, domain, title, acceptance_criteria, source_page, priority, owner_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$id, $projectId, $wbs, $domain, $title, $criteria, $sourcePage, $priority, $ownerType]);
        log_activity($pdo, (int) $user['id'], 'task', $id, 'create', [], $projectId);
        json_response(['ok' => true, 'message' => "فعالیت {$id} ایجاد شد."]);
    }

    if ($action === 'delete_task') {
        require_project_manager($project);
        $id = (string) ($input['id'] ?? '');
        $unlinkIssues = $pdo->prepare('UPDATE issues SET task_id = NULL WHERE task_id = ? AND project_id = ?');
        $unlinkIssues->execute([$id, $projectId]);
        $statement = $pdo->prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?');
        $statement->execute([$id, $projectId]);
        if ($statement->rowCount() === 0) {
            json_response(['ok' => false, 'error' => 'فعالیت در این پروژه پیدا نشد.'], 404);
        }
        log_activity($pdo, (int) $user['id'], 'task', $id, 'delete', [], $projectId);
        json_response(['ok' => true, 'message' => 'فعالیت حذف شد.']);
    }

    if ($action === 'update_task') {
        require_project_editor($project);
        if ($project['access_role'] !== 'project_manager') {
            require_role($user, ['manager', 'contractor']);
        }
        $id = (string) ($input['id'] ?? '');
        $status = (string) ($input['status'] ?? 'todo');
        $progress = max(0, min(100, (int) ($input['progress'] ?? 0)));
        $deadline = trim((string) ($input['contractor_deadline'] ?? '')) ?: null;
        $notes = trim((string) ($input['notes'] ?? ''));
        if (!in_array($status, ['todo', 'in_progress', 'review', 'done', 'blocked'], true)) {
            json_response(['ok' => false, 'error' => 'وضعیت انتخاب‌شده معتبر نیست.'], 422);
        }
        if (!valid_iso_date($deadline)) {
            json_response(['ok' => false, 'error' => 'تاریخ ددلاین معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare(
            'UPDATE tasks SET status = ?, progress = ?, contractor_deadline = ?, notes = ?
             WHERE id = ? AND project_id = ?'
        );
        $statement->execute([$status, $progress, $deadline, $notes, $id, $projectId]);
        log_activity($pdo, (int) $user['id'], 'task', $id, 'update', [
            'status' => $status,
            'progress' => $progress,
            'deadline' => $deadline,
        ], $projectId);
        json_response(['ok' => true, 'message' => 'فعالیت با موفقیت به‌روزرسانی شد.']);
    }

    if ($action === 'approve_task') {
        require_project_editor($project);
        $id = (string) ($input['id'] ?? '');
        $decision = (string) ($input['decision'] ?? 'pending');
        $kind = (string) ($input['kind'] ?? '');
        if (!in_array($decision, ['pending', 'approved', 'rejected'], true)) {
            json_response(['ok' => false, 'error' => 'تصمیم تأیید معتبر نیست.'], 422);
        }
        if ($kind === 'supervisor') {
            if ($project['access_role'] !== 'project_manager') {
                require_role($user, ['manager', 'supervisor']);
            }
            $field = 'supervisor_approval';
        } elseif ($kind === 'operator') {
            if ($project['access_role'] !== 'project_manager') {
                require_role($user, ['manager', 'operator']);
            }
            $field = 'operator_approval';
        } else {
            json_response(['ok' => false, 'error' => 'نوع تأیید معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare("UPDATE tasks SET {$field} = ? WHERE id = ? AND project_id = ?");
        $statement->execute([$decision, $id, $projectId]);
        if ($statement->rowCount() === 0) {
            json_response(['ok' => false, 'error' => 'فعالیت در این پروژه پیدا نشد یا وضعیت آن تغییری نکرد.'], 404);
        }
        log_activity($pdo, (int) $user['id'], 'task', $id, $kind . '_approval', ['decision' => $decision], $projectId);
        json_response([
            'ok' => true,
            'message' => $decision === 'pending' ? 'تأیید لغو و وضعیت به «در انتظار» بازگردانده شد.' : 'نظر تأیید ثبت شد.',
        ]);
    }

    if ($action === 'create_issue') {
        require_project_editor($project);
        $title = trim((string) ($input['title'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $taskId = trim((string) ($input['task_id'] ?? '')) ?: null;
        $severity = (string) ($input['severity'] ?? 'medium');
        $dueDate = trim((string) ($input['due_date'] ?? '')) ?: null;
        if ($title === '' || $description === '' || !in_array($severity, ['low', 'medium', 'high', 'critical'], true)) {
            json_response(['ok' => false, 'error' => 'عنوان، شرح و شدت اشکال را کامل کنید.'], 422);
        }
        if (!valid_iso_date($dueDate)) {
            json_response(['ok' => false, 'error' => 'تاریخ مهلت رفع معتبر نیست.'], 422);
        }
        if ($taskId !== null) {
            $taskCheck = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE id = ? AND project_id = ?');
            $taskCheck->execute([$taskId, $projectId]);
            if ((int) $taskCheck->fetchColumn() === 0) {
                json_response(['ok' => false, 'error' => 'فعالیت مرتبط در این پروژه نیست.'], 422);
            }
        }
        $statement = $pdo->prepare(
            'INSERT INTO issues (project_id, task_id, title, description, severity, reported_by, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$projectId, $taskId, $title, $description, $severity, (int) $user['id'], $dueDate]);
        $id = (string) $pdo->lastInsertId();
        log_activity($pdo, (int) $user['id'], 'issue', $id, 'create', ['task_id' => $taskId], $projectId);
        json_response(['ok' => true, 'message' => 'اشکال جدید ثبت شد.']);
    }

    if ($action === 'update_issue') {
        require_project_editor($project);
        $id = (int) ($input['id'] ?? 0);
        $status = (string) ($input['status'] ?? '');
        if (!in_array($status, ['open', 'in_progress', 'resolved', 'closed'], true)) {
            json_response(['ok' => false, 'error' => 'وضعیت اشکال معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare('UPDATE issues SET status = ? WHERE id = ? AND project_id = ?');
        $statement->execute([$status, $id, $projectId]);
        log_activity($pdo, (int) $user['id'], 'issue', (string) $id, 'status_change', ['status' => $status], $projectId);
        json_response(['ok' => true, 'message' => 'وضعیت اشکال تغییر کرد.']);
    }

    if ($action === 'delete_issue') {
        require_project_manager($project);
        $id = (int) ($input['id'] ?? 0);
        if ($id < 1) {
            json_response(['ok' => false, 'error' => 'شناسه اشکال معتبر نیست.'], 422);
        }
        $statement = $pdo->prepare('DELETE FROM issues WHERE id = ? AND project_id = ?');
        $statement->execute([$id, $projectId]);
        if ($statement->rowCount() === 0) {
            json_response(['ok' => false, 'error' => 'رکورد اشکال پیدا نشد.'], 404);
        }
        log_activity($pdo, (int) $user['id'], 'issue', (string) $id, 'delete', [], $projectId);
        json_response(['ok' => true, 'message' => 'رکورد اشکال حذف شد.']);
    }

    if ($action === 'create_meeting') {
        require_project_editor($project);
        $title = trim((string) ($input['title'] ?? ''));
        $date = trim((string) ($input['meeting_date'] ?? ''));
        $participants = trim((string) ($input['participants'] ?? ''));
        $decisions = trim((string) ($input['decisions'] ?? ''));
        $actions = trim((string) ($input['actions'] ?? ''));
        if ($title === '' || $date === '' || $participants === '' || $decisions === '') {
            json_response(['ok' => false, 'error' => 'اطلاعات اصلی جلسه را کامل کنید.'], 422);
        }
        $statement = $pdo->prepare(
            'INSERT INTO meetings (project_id, title, meeting_date, participants, decisions, actions, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$projectId, $title, str_replace('T', ' ', $date), $participants, $decisions, $actions, (int) $user['id']]);
        $id = (string) $pdo->lastInsertId();
        log_activity($pdo, (int) $user['id'], 'meeting', $id, 'create', [], $projectId);
        json_response(['ok' => true, 'message' => 'صورت‌جلسه ثبت شد.']);
    }

    if ($action === 'set_project_member') {
        require_project_manager($project);
        $memberId = (int) ($input['user_id'] ?? 0);
        $accessRole = (string) ($input['access_role'] ?? 'viewer');
        if ($memberId < 1 || !in_array($accessRole, ['project_manager', 'editor', 'viewer'], true)) {
            json_response(['ok' => false, 'error' => 'کاربر یا سطح دسترسی معتبر نیست.'], 422);
        }
        ensure_last_project_manager($pdo, $projectId, $memberId, $accessRole);
        $statement = $pdo->prepare(
            'INSERT INTO project_users (project_id, user_id, access_role) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE access_role = VALUES(access_role)'
        );
        $statement->execute([$projectId, $memberId, $accessRole]);
        log_activity($pdo, (int) $user['id'], 'project_member', (string) $memberId, 'set_access', ['access_role' => $accessRole], $projectId);
        json_response(['ok' => true, 'message' => 'دسترسی عضو پروژه ذخیره شد.']);
    }

    if ($action === 'remove_project_member') {
        require_project_manager($project);
        $memberId = (int) ($input['user_id'] ?? 0);
        ensure_last_project_manager($pdo, $projectId, $memberId);
        $statement = $pdo->prepare('DELETE FROM project_users WHERE project_id = ? AND user_id = ?');
        $statement->execute([$projectId, $memberId]);
        log_activity($pdo, (int) $user['id'], 'project_member', (string) $memberId, 'remove', [], $projectId);
        json_response(['ok' => true, 'message' => 'دسترسی کاربر به پروژه حذف شد.']);
    }

    if ($action === 'create_user') {
        require_project_manager($project);
        $name = trim((string) ($input['display_name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $role = (string) ($input['role'] ?? 'viewer');
        $accessRole = (string) ($input['access_role'] ?? 'viewer');
        $roles = ['manager', 'contractor', 'supervisor', 'operator', 'viewer'];
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($password) < 10
            || !in_array($role, $roles, true) || !in_array($accessRole, ['project_manager', 'editor', 'viewer'], true)) {
            json_response(['ok' => false, 'error' => 'اطلاعات کاربر، رمز یا سطح دسترسی معتبر نیست.'], 422);
        }
        if ($role === 'manager' && $user['role'] !== 'manager') {
            json_response(['ok' => false, 'error' => 'فقط مدیر سامانه می‌تواند کاربر با نقش سازمانی مدیر ایجاد کند.'], 403);
        }
        try {
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
            );
            $statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, $role]);
            $memberId = (int) $pdo->lastInsertId();
            $member = $pdo->prepare(
                'INSERT INTO project_users (project_id, user_id, access_role) VALUES (?, ?, ?)'
            );
            $member->execute([$projectId, $memberId, $accessRole]);
            log_activity($pdo, (int) $user['id'], 'user', (string) $memberId, 'create', [
                'role' => $role,
                'access_role' => $accessRole,
            ], $projectId);
            $pdo->commit();
            json_response(['ok' => true, 'message' => 'کاربر ایجاد و به پروژه اضافه شد.']);
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ((string) $exception->getCode() === '23000') {
                json_response(['ok' => false, 'error' => 'این ایمیل قبلاً ثبت شده است.'], 409);
            }
            throw $exception;
        }
    }

    json_response(['ok' => false, 'error' => 'عملیات درخواست‌شده شناخته نشد.'], 404);
} catch (Throwable $exception) {
    error_log($exception->__toString());
    json_response(['ok' => false, 'error' => 'خطای داخلی رخ داد. جزئیات در گزارش سرور ثبت شد.'], 500);
}
