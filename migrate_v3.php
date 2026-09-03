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
    exit('فقط مدیر سامانه اجازه اجرای ارتقا را دارد.');
}

$error = null;
$success = false;

function v3_column_exists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $statement->execute([$table, $column]);
    return (int) $statement->fetchColumn() > 0;
}

try {
    $pdo = db();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
            throw new RuntimeException('درخواست معتبر نیست؛ صفحه را تازه‌سازی کنید.');
        }

        $columns = [
            ['bale_bot_token', 'TEXT NULL AFTER end_date'],
            ['bale_chat_id', 'VARCHAR(190) NULL AFTER bale_bot_token'],
            ['bale_enabled', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER bale_chat_id'],
        ];
        foreach ($columns as [$column, $definition]) {
            if (!v3_column_exists($pdo, 'projects', $column)) {
                $pdo->exec("ALTER TABLE projects ADD COLUMN {$column} {$definition}");
            }
        }

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
    <title>فعال‌سازی اعلان‌های بله</title>
    <link rel="stylesheet" href="assets/app.css?v=2.1.0">
</head>
<body class="install-page">
<main class="install-card">
    <div class="brand-mark">ب</div>
    <p class="eyebrow">ارتقای نسخه نصب‌شده</p>
    <h1>فعال‌سازی اعلان‌های پیام‌رسان بله</h1>
    <?php if ($success): ?>
        <div class="alert success">ارتقا انجام شد. اکنون فایل <code>migrate_v3.php</code> را از هاست حذف و اتصال بله را در تنظیمات هر پروژه ثبت کنید.</div>
        <a class="button primary" href="index.php">بازگشت به سامانه</a>
    <?php else: ?>
        <?php if ($error): ?><div class="alert error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <div class="alert info">این ارتقا هیچ داده‌ای را حذف نمی‌کند و فقط فیلدهای تنظیمات اعلان بله را به پروژه‌ها اضافه می‌کند.</div>
        <form method="post">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
            <button class="button primary wide" type="submit">اجرای ارتقای اعلان بله</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
