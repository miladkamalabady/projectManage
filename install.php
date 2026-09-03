<?php

declare(strict_types=1);

$error = null;
$success = false;
$configExists = is_file(__DIR__ . '/config.php');

if ($configExists) {
    require __DIR__ . '/lib/bootstrap.php';
    try {
        app_config();
        start_secure_session();
        $pdo = db();
        $installed = (bool) $pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn();
        if ($installed) {
            $installed = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$installed) {
            $name = trim((string) ($_POST['display_name'] ?? ''));
            $email = strtolower(trim((string) ($_POST['email'] ?? '')));
            $password = (string) ($_POST['password'] ?? '');

            if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
                throw new RuntimeException('درخواست نامعتبر است؛ صفحه را تازه‌سازی کنید.');
            }
            if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('نام و ایمیل معتبر وارد کنید.');
            }
            if (mb_strlen($password) < 10) {
                throw new RuntimeException('رمز عبور باید حداقل ۱۰ نویسه داشته باشد.');
            }

            $schema = file_get_contents(__DIR__ . '/schema.sql');
            if ($schema === false) {
                throw new RuntimeException('فایل ساختار پایگاه داده خوانده نشد.');
            }
            foreach (preg_split('/;\s*(?:\r?\n|$)/', $schema) ?: [] as $query) {
                $query = trim($query);
                if ($query !== '') {
                    $pdo->exec($query);
                }
            }

            $pdo->beginTransaction();
            $userStatement = $pdo->prepare(
                "INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, 'manager')"
            );
            $userStatement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name]);
            $adminId = (int) $pdo->lastInsertId();

            $items = json_decode((string) file_get_contents(__DIR__ . '/data/requirements.json'), true, 512, JSON_THROW_ON_ERROR);
            if (count($items) !== 159) {
                throw new RuntimeException('فهرست اولیه فعالیت‌ها کامل نیست.');
            }
            $taskStatement = $pdo->prepare(
                'INSERT INTO tasks (id, wbs, domain, title, acceptance_criteria, source_page, priority, owner_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($items as $item) {
                $taskStatement->execute([
                    $item['id'],
                    $item['wbs'],
                    $item['domain'],
                    $item['title'],
                    $item['acceptanceCriteria'],
                    $item['sourcePage'],
                    $item['priority'],
                    $item['ownerType'],
                ]);
            }
            log_activity($pdo, $adminId, 'system', 'installation', 'install', ['task_count' => count($items)]);
            $pdo->commit();
            $installed = true;
            $success = true;
        }
    } catch (Throwable $exception) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $error = $exception->getMessage();
        $installed = false;
    }
} else {
    $installed = false;
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>نصب سامانه مدیریت پروژه سمپاد</title>
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="install-page">
<main class="install-card">
    <div class="brand-mark">س</div>
    <p class="eyebrow">راه‌اندازی روی cPanel</p>
    <h1>نصب سامانه مدیریت پروژه سمپاد</h1>
    <?php if (!$configExists): ?>
        <div class="alert error">فایل <code>config.php</code> وجود ندارد. ابتدا از روی <code>config.example.php</code> یک کپی بسازید و اطلاعات MySQL را وارد کنید.</div>
    <?php elseif ($success): ?>
        <div class="alert success">نصب انجام شد و ۱۵۹ فعالیت ثبت شدند. اکنون برای امنیت، فایل <code>install.php</code> را حذف کنید.</div>
        <a class="button primary" href="index.php">ورود به سامانه</a>
    <?php elseif ($installed): ?>
        <div class="alert success">سامانه قبلاً نصب شده است.</div>
        <a class="button primary" href="index.php">ورود به سامانه</a>
    <?php else: ?>
        <?php if ($error): ?><div class="alert error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <form method="post" class="form-stack">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
            <label>نام مدیر پروژه<input name="display_name" required autocomplete="name"></label>
            <label>ایمیل مدیر<input name="email" type="email" required autocomplete="email"></label>
            <label>رمز عبور اولیه<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
            <button class="button primary" type="submit">ساخت پایگاه داده و نصب</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
