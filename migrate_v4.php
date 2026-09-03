<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

@set_time_limit(180);

start_secure_session();
$user = current_user();
if ($user === null) {
    header('Location: index.php');
    exit;
}
if ($user['role'] !== 'manager') {
    http_response_code(403);
    exit('فقط مدیر سامانه اجازه اجرای این مهاجرت را دارد.');
}

$projects = [
    ['NORINO', 'norino', 'سامانه نورینو', 'خدمات پرورشی و فرهنگی', 'معاونت پرورشی و فرهنگی', '15'],
    ['STUDENT_BOARD', 'heyat', 'سامانه هیئت‌های دانش‌آموزی', 'خدمات پرورشی و فرهنگی', 'معاونت پرورشی و فرهنگی', '2'],
    ['NORCHESHM', 'norcheshm', 'سامانه نورچشم (نماز)', 'خدمات پرورشی و فرهنگی', 'معاونت پرورشی و فرهنگی', '1.5'],
    ['QURANBOOM', 'quranboom', 'سامانه قرآن‌بوم (سامانه جامع آموزش عمومی قرآن کریم)', 'خدمات پرورشی و فرهنگی', 'کمیسیون توسعه آموزش عمومی قرآن کشور', '20'],
    ['NAMAD', 'namad', 'سامانه نماد (نظام مراقبت از آسیب‌های اجتماعی دانش‌آموزان)', 'خدمات پرورشی و فرهنگی', 'معاونت پرورشی و فرهنگی', '20'],
    ['CAMPS', 'ordoo', 'نظارت و کنترل اردوهای دانش‌آموزی', 'خدمات پرورشی و فرهنگی', 'معاونت پرورشی و فرهنگی', '4'],
    ['NESHAT', 'neshat', 'سامانه نشاط', 'خدمات تربیت بدنی و سلامت', 'معاونت تربیت بدنی و سلامت', '20'],
    ['MAHJ', 'mahj', 'تارنمای اطلاعات جامع شهدای دانش‌آموزی و فرهنگی «مهج»', 'خدمات پرورشی و فرهنگی', 'اداره کل شاهد و ایثارگران', '0.5'],
    ['PTA', 'anjoman', 'سامانه انجمن اولیا و مربیان', 'خدمات پرورشی و فرهنگی', 'اداره کل انجمن اولیا و مربیان', '18'],
    ['JANAN', 'janan', 'سامانه جانان ایران', 'خدمات پرورشی و فرهنگی', 'اداره امور زنان', '0.75'],
    ['PORTAL', 'portal', 'پورتال اطلاع‌رسانی', 'خدمات پرورشی و فرهنگی', 'مرکز اطلاع‌رسانی و روابط عمومی', '1.75'],
    ['KANDO', 'kando', 'سامانه کندو', 'خدمات پرورشی و فرهنگی', 'مرکز توسعه آموزش مجازی، فناوری و امنیت اطلاعات', '1'],
    ['LEARNING_COMM', 'ejtemaat', 'سامانه اجتماعات یادگیری ـ ابتدایی', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش ابتدایی', '2.75'],
    ['SHAMIM', 'shamim', 'سامانه شمیم', 'پرورشی و فرهنگی', 'معاونت آموزش متوسطه ـ معاونت تربیت بدنی و سلامت', '1.75'],
    ['FESTIVAL', 'jashnvareh', 'سامانه جشنواره‌ساز', 'خدمات پرورشی و فرهنگی', 'مرکز توسعه آموزش مجازی، فناوری و امنیت اطلاعات', '6'],
    ['JASHN_PAJOOH', 'pazhooheshsara', 'جشنواره علمی ـ پژوهشی پژوهش‌سراهای دانش‌آموزی ـ متوسطه', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش متوسطه', '0.75'],
    ['KHARAZMI', 'kharazmi', 'جشنواره نوجوان خوارزمی', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش متوسطه', '0.75'],
    ['JASHN_NOV', 'noavari', 'جشنواره نوآوری در فرایند آموزش و یادگیری ویژه معلمان', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش متوسطه', '0.25'],
    ['JASHN_METHOD', 'ravesh', 'جشنواره اصلاح روش‌های آموزش و تحول در محیط‌های یادگیری ـ آموزش ابتدایی', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش ابتدایی', '0.25'],
    ['JASHN_SKILL', 'maharat', 'جشنواره هر پایه یک مهارت ـ ابتدایی', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش ابتدایی', '0.25'],
    ['QUALITY_ELEM', 'keyfiat', 'سامانه جامع کیفیت‌بخشی فعالیت‌های آموزشی ـ مهارتی دانش‌آموزان و نیروی انسانی دوره ابتدایی', 'خدمات پرورشی و فرهنگی', 'معاونت آموزش ابتدایی', '0.25'],
    ['GROWTH_PROFILE', 'roshd', 'سامانه نمایه رشدی تربیتی دانش‌آموزان', 'خدمات پرورشی و فرهنگی', 'مرکز توسعه آموزش مجازی، فناوری و امنیت اطلاعات', '1.5'],
    ['AI_CHATBOT', 'chatbot', 'سامانه هوش مصنوعی ـ چت‌بات', 'خدمات پرورشی و فرهنگی', 'مرکز توسعه آموزش مجازی، فناوری و امنیت اطلاعات', '1'],
];

$error = null;
$success = false;
$results = [];
$createdProjects = 0;
$createdUsers = 0;

function v4_column_exists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $statement->execute([$table, $column]);
    return (int) $statement->fetchColumn() > 0;
}

function v4_ensure_user(PDO $pdo, string $email, string $displayName, string $role): array
{
    $find = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $find->execute([$email]);
    $userId = (int) ($find->fetchColumn() ?: 0);
    if ($userId > 0) {
        return [$userId, false, null];
    }

    $temporaryPassword = 'Pm!' . bin2hex(random_bytes(8));
    $insert = $pdo->prepare(
        'INSERT INTO users (email, password_hash, display_name, role, active, must_change_password)
         VALUES (?, ?, ?, ?, 1, 1)'
    );
    $insert->execute([$email, password_hash($temporaryPassword, PASSWORD_DEFAULT), $displayName, $role]);
    return [(int) $pdo->lastInsertId(), true, $temporaryPassword];
}

try {
    $pdo = db();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
            throw new RuntimeException('درخواست معتبر نیست؛ صفحه را تازه‌سازی کنید.');
        }

        if (!v4_column_exists($pdo, 'users', 'must_change_password')) {
            $pdo->exec('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER active');
        }

        $pdo->beginTransaction();
        $findProject = $pdo->prepare('SELECT id FROM projects WHERE code = ?');
        $insertProject = $pdo->prepare(
            "INSERT INTO projects (name, code, description, status, created_by) VALUES (?, ?, ?, 'active', ?)"
        );
        $setManager = $pdo->prepare(
            "INSERT INTO project_users (project_id, user_id, access_role) VALUES (?, ?, 'project_manager')
             ON DUPLICATE KEY UPDATE access_role = 'project_manager'"
        );
        $setMember = $pdo->prepare(
            "INSERT INTO project_users (project_id, user_id, access_role) VALUES (?, ?, 'editor')
             ON DUPLICATE KEY UPDATE access_role = IF(access_role = 'project_manager', access_role, 'editor')"
        );

        foreach ($projects as [$code, $slug, $name, $category, $contentOwner, $weight]) {
            $findProject->execute([$code]);
            $projectId = (int) ($findProject->fetchColumn() ?: 0);
            $projectCreated = false;
            if ($projectId < 1) {
                $description = "استخراج‌شده از سند خدمات پرورشی و فرهنگی ۱۴۰۵\n"
                    . "دسته‌بندی: {$category}\nناظر محتوایی: {$contentOwner}\nوزن اعلام‌شده در سند: {$weight} درصد";
                $insertProject->execute([$name, $code, $description, (int) $user['id']]);
                $projectId = (int) $pdo->lastInsertId();
                $projectCreated = true;
                $createdProjects++;
            }

            $setManager->execute([$projectId, (int) $user['id']]);

            $nazerEmail = $slug . 'nazer@' . $slug . '.com';
            $karfarmaEmail = $slug . 'karfarma@' . $slug . '.com';
            [$nazerId, $nazerCreated, $nazerPassword] = v4_ensure_user($pdo, $nazerEmail, 'ناظر ـ ' . $name, 'supervisor');
            [$karfarmaId, $karfarmaCreated, $karfarmaPassword] = v4_ensure_user($pdo, $karfarmaEmail, 'کارفرما ـ ' . $name, 'operator');
            $createdUsers += (int) $nazerCreated + (int) $karfarmaCreated;

            $setMember->execute([$projectId, $nazerId]);
            $setMember->execute([$projectId, $karfarmaId]);
            $results[] = [
                'name' => $name,
                'code' => $code,
                'nazer' => $nazerEmail,
                'karfarma' => $karfarmaEmail,
                'nazer_password' => $nazerPassword,
                'karfarma_password' => $karfarmaPassword,
                'project_created' => $projectCreated,
                'nazer_created' => $nazerCreated,
                'karfarma_created' => $karfarmaCreated,
            ];
        }

        $pdo->commit();
        try {
            log_activity($pdo, (int) $user['id'], 'system', 'cultural-projects-1405', 'migrate', [
                'project_count' => count($projects),
                'created_projects' => $createdProjects,
                'created_users' => $createdUsers,
            ]);
        } catch (Throwable $logException) {
            error_log('Migration v4 activity log failed: ' . $logException->getMessage());
        }
        $success = true;
    }
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $error = $exception->getMessage();
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>افزودن پروژه‌های خدمات پرورشی و فرهنگی ۱۴۰۵</title>
    <link rel="stylesheet" href="assets/app.css?v=2.2.0">
</head>
<body class="install-page">
<main class="install-card migration-wide">
    <div class="brand-mark">۲۳</div>
    <p class="eyebrow">مهاجرت پروژه‌ها و حساب‌ها</p>
    <h1>پروژه‌های خدمات پرورشی و فرهنگی ۱۴۰۵</h1>
    <?php if ($success): ?>
        <div class="alert success"><?= $createdProjects ?> پروژه و <?= $createdUsers ?> کاربر جدید ساخته شد. موارد موجود بدون بازنشانی رمز حفظ شدند.</div>
        <div class="alert info">رمزهای موقت تصادفی فقط در جدول زیر نمایش داده می‌شوند. این صفحه را ذخیره کنید؛ هر کاربر در اولین ورود ملزم به تعیین رمز شخصی خواهد بود.</div>
        <div class="table-wrap migration-table"><table class="data-table"><thead><tr><th>پروژه</th><th>کد</th><th>حساب ناظر</th><th>رمز موقت ناظر</th><th>حساب کارفرما</th><th>رمز موقت کارفرما</th></tr></thead><tbody>
        <?php foreach ($results as $row): ?>
            <tr>
                <td><strong><?= htmlspecialchars($row['name'], ENT_QUOTES, 'UTF-8') ?></strong></td>
                <td><span class="code"><?= htmlspecialchars($row['code'], ENT_QUOTES, 'UTF-8') ?></span></td>
                <td><span class="code"><?= htmlspecialchars($row['nazer'], ENT_QUOTES, 'UTF-8') ?></span></td>
                <td><span class="code"><?= htmlspecialchars($row['nazer_password'] ?? 'رمز فعلی حفظ شد', ENT_QUOTES, 'UTF-8') ?></span></td>
                <td><span class="code"><?= htmlspecialchars($row['karfarma'], ENT_QUOTES, 'UTF-8') ?></span></td>
                <td><span class="code"><?= htmlspecialchars($row['karfarma_password'] ?? 'رمز فعلی حفظ شد', ENT_QUOTES, 'UTF-8') ?></span></td>
            </tr>
        <?php endforeach; ?>
        </tbody></table></div>
        <div class="button-row migration-actions"><button class="button secondary" type="button" onclick="window.print()">چاپ / ذخیره فهرست حساب‌ها</button><a class="button primary" href="index.php">بازگشت به سامانه</a></div>
        <div class="alert error"><strong>اقدام امنیتی:</strong> پس از ذخیره فهرست حساب‌ها، فایل <code>migrate_v4.php</code> را از هاست حذف کنید.</div>
    <?php else: ?>
        <?php if ($error): ?><div class="alert error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <div class="alert info">این مهاجرت ۲۳ پروژه و برای هر پروژه یک ناظر و یک کارفرما با رمز موقت تصادفی ایجاد می‌کند. مدیر فعلی، مدیر همه پروژه‌ها خواهد شد. اجرای مجدد، پروژه و کاربر تکراری نمی‌سازد و رمز حساب موجود را تغییر نمی‌دهد.</div>
        <form method="post" class="form-stack">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
            <button class="button primary wide" type="submit">ایجاد پروژه‌ها و حساب‌ها</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
