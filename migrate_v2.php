<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

start_secure_session();
$user = current_user();
if ($user === null) {
    header('Location: index.php');
    exit;
}
if ($user['role'] !== 'manager') {
    http_response_code(403);
    exit('فقط مدیر پروژه اجازه اجرای ارتقا را دارد.');
}

$error = null;
$success = false;

function migration_column_exists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $statement->execute([$table, $column]);
    return (int) $statement->fetchColumn() > 0;
}

function migration_index_exists(PDO $pdo, string $table, string $index): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?'
    );
    $statement->execute([$table, $index]);
    return (int) $statement->fetchColumn() > 0;
}

try {
    $pdo = db();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
            throw new RuntimeException('درخواست معتبر نیست؛ صفحه را تازه‌سازی کنید.');
        }

        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS projects (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(40) NOT NULL UNIQUE,
                description TEXT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'active',
                start_date DATE NULL,
                end_date DATE NULL,
                created_by BIGINT UNSIGNED NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id),
                INDEX idx_projects_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS project_users (
                project_id BIGINT UNSIGNED NOT NULL,
                user_id BIGINT UNSIGNED NOT NULL,
                access_role VARCHAR(32) NOT NULL DEFAULT 'viewer',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, user_id),
                CONSTRAINT fk_project_users_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                CONSTRAINT fk_project_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_project_users_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        $projectStatement = $pdo->prepare('SELECT id FROM projects WHERE code = ?');
        $projectStatement->execute(['SAMPAD']);
        $projectId = (int) ($projectStatement->fetchColumn() ?: 0);
        if ($projectId === 0) {
            $insertProject = $pdo->prepare(
                "INSERT INTO projects (name, code, description, status, created_by)
                 VALUES (?, ?, ?, 'active', ?)"
            );
            $insertProject->execute([
                'سامانه جامع سمپاد',
                'SAMPAD',
                'پروژه اولیه شامل ۱۵۹ فعالیت استخراج‌شده از صفحات ۶ تا ۱۶ RFP',
                (int) $user['id'],
            ]);
            $projectId = (int) $pdo->lastInsertId();
        }

        $members = $pdo->query('SELECT id, role FROM users')->fetchAll();
        $memberStatement = $pdo->prepare(
            'INSERT IGNORE INTO project_users (project_id, user_id, access_role) VALUES (?, ?, ?)'
        );
        foreach ($members as $member) {
            $access = $member['role'] === 'manager'
                ? 'project_manager'
                : ($member['role'] === 'viewer' ? 'viewer' : 'editor');
            $memberStatement->execute([$projectId, (int) $member['id'], $access]);
        }

        $columns = [
            ['tasks', 'project_id', 'BIGINT UNSIGNED NULL AFTER id'],
            ['issues', 'project_id', 'BIGINT UNSIGNED NULL AFTER id'],
            ['meetings', 'project_id', 'BIGINT UNSIGNED NULL AFTER id'],
            ['activity_logs', 'project_id', 'BIGINT UNSIGNED NULL AFTER id'],
        ];
        foreach ($columns as [$table, $column, $definition]) {
            if (!migration_column_exists($pdo, $table, $column)) {
                $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
            }
            $update = $pdo->prepare("UPDATE {$table} SET project_id = ? WHERE project_id IS NULL");
            $update->execute([$projectId]);
        }

        $indexes = [
            ['tasks', 'idx_tasks_project'],
            ['issues', 'idx_issues_project'],
            ['meetings', 'idx_meetings_project'],
            ['activity_logs', 'idx_logs_project'],
        ];
        foreach ($indexes as [$table, $index]) {
            if (!migration_index_exists($pdo, $table, $index)) {
                $pdo->exec("ALTER TABLE {$table} ADD INDEX {$index} (project_id)");
            }
        }

        $pdo->exec('ALTER TABLE tasks MODIFY project_id BIGINT UNSIGNED NOT NULL');
        $pdo->exec('ALTER TABLE issues MODIFY project_id BIGINT UNSIGNED NOT NULL');
        $pdo->exec('ALTER TABLE meetings MODIFY project_id BIGINT UNSIGNED NOT NULL');

        log_activity(
            $pdo,
            (int) $user['id'],
            'system',
            'migration_v2',
            'migrate',
            ['default_project_id' => $projectId],
            $projectId
        );
        $success = true;
    }
} catch (Throwable $exception) {
    $error = $exception->getMessage();
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ارتقای چندپروژه‌ای سامانه</title>
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="install-page">
<main class="install-card">
    <div class="brand-mark">س</div>
    <p class="eyebrow">ارتقای نسخه نصب‌شده</p>
    <h1>فعال‌سازی مدیریت چند پروژه</h1>
    <?php if ($success): ?>
        <div class="alert success">ارتقا انجام شد. فعالیت‌ها، اشکالات و جلسات قبلی به پروژه «سامانه جامع سمپاد» متصل شدند. اکنون فایل <code>migrate_v2.php</code> را از هاست حذف کنید.</div>
        <a class="button primary" href="index.php">بازگشت به سامانه</a>
    <?php else: ?>
        <?php if ($error): ?><div class="alert error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <div class="alert info">این عملیات داده‌های موجود را حذف نمی‌کند. همه کاربران فعلی به پروژه سمپاد متصل می‌شوند و مدیران، دسترسی مدیریت پروژه خواهند داشت.</div>
        <form method="post">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
            <button class="button primary wide" type="submit">اجرای ارتقای چندپروژه‌ای</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
