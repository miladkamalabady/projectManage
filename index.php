<?php

declare(strict_types=1);

$configMissing = !is_file(__DIR__ . '/config.php');
$loginError = null;
$passwordChangeError = null;
$user = null;

if (!$configMissing) {
    require __DIR__ . '/lib/bootstrap.php';
    try {
        start_secure_session();
        $pdo = db();
        $installed = (bool) $pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn();
        if ($installed) {
            $installed = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
        }
        if (!$installed) {
            header('Location: install.php');
            exit;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['logout'])) {
            if (hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
                $_SESSION = [];
                session_destroy();
            }
            header('Location: index.php');
            exit;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
            if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
                $loginError = 'درخواست نامعتبر است. دوباره تلاش کنید.';
            } else {
                $email = strtolower(trim((string) ($_POST['email'] ?? '')));
                $password = (string) ($_POST['password'] ?? '');
                $statement = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ? AND active = 1');
                $statement->execute([$email]);
                $account = $statement->fetch();
                if ($account && password_verify($password, $account['password_hash'])) {
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $account['id'];
                    header('Location: index.php');
                    exit;
                }
                $loginError = 'ایمیل یا رمز عبور صحیح نیست.';
            }
        }
        $user = current_user();
        if ($user && !empty($user['must_change_password']) && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['set_initial_password'])) {
            if (!hash_equals(csrf_token(), (string) ($_POST['csrf_token'] ?? ''))) {
                $passwordChangeError = 'درخواست نامعتبر است. صفحه را تازه‌سازی کنید.';
            } else {
                $newPassword = (string) ($_POST['new_password'] ?? '');
                $confirmPassword = (string) ($_POST['confirm_password'] ?? '');
                if (mb_strlen($newPassword) < 10) {
                    $passwordChangeError = 'رمز جدید باید حداقل ۱۰ نویسه داشته باشد.';
                } elseif (!hash_equals($newPassword, $confirmPassword)) {
                    $passwordChangeError = 'رمز جدید و تکرار آن یکسان نیستند.';
                } elseif (strcasecmp($newPassword, (string) $user['email']) === 0) {
                    $passwordChangeError = 'رمز جدید نباید همان ایمیل یا رمز اولیه باشد.';
                } else {
                    $statement = $pdo->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?');
                    $statement->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $user['id']]);
                    session_regenerate_id(true);
                    log_activity($pdo, (int) $user['id'], 'user', (string) $user['id'], 'change_password');
                    header('Location: index.php');
                    exit;
                }
            }
        }
    } catch (Throwable $exception) {
        $loginError = 'ارتباط با پایگاه داده برقرار نشد. تنظیمات config.php را بررسی کنید.';
    }
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="سامانه یکپارچه مدیریت و کنترل پروژه‌ها">
    <title>سامانه مدیریت پروژه</title>
    <link rel="stylesheet" href="assets/app.css?v=2.2.0">
</head>
<body>
<?php if ($configMissing): ?>
    <main class="install-card centered">
        <div class="brand-mark">س</div>
        <h1>تنظیمات سامانه کامل نیست</h1>
        <div class="alert error">فایل <code>config.php</code> را از روی <code>config.example.php</code> بسازید و سپس <a href="install.php">نصب سامانه</a> را اجرا کنید.</div>
    </main>
<?php elseif (!$user): ?>
    <main class="login-layout">
        <section class="login-intro">
            <div class="brand-lockup"><div class="brand-mark">م</div><div><strong>مدیریت پروژه</strong><small>کنترل و نظارت یکپارچه</small></div></div>
            <div>
                <p class="eyebrow light">سامانه چندپروژه‌ای کنترل و نظارت</p>
                <h1>مدیریت پروژه، از برنامه‌ریزی تا تحویل نهایی</h1>
                <p>فعالیت‌ها، ددلاین‌ها، تأیید ناظر و بهره‌بردار، اشکالات و مصوبات هر پروژه را شفاف و یکپارچه پیگیری کنید.</p>
            </div>
            <div class="login-stats"><span><strong>✓</strong> فعالیت و ددلاین</span><span><strong>✓</strong> تأیید و اشکال</span><span><strong>✓</strong> گزارش و تاریخچه</span></div>
        </section>
        <section class="login-panel">
            <form method="post" class="login-form">
                <p class="eyebrow">ورود کاربران</p>
                <h2>ورود به سامانه</h2>
                <p>با حسابی که مدیر پروژه برای شما تعریف کرده وارد شوید.</p>
                <?php if ($loginError): ?><div class="alert error"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
                <label>ایمیل سازمانی<input name="email" type="email" required autocomplete="username" autofocus></label>
                <label>رمز عبور<input name="password" type="password" required autocomplete="current-password"></label>
                <button class="button primary wide" name="login" value="1" type="submit">ورود به سامانه</button>
                <a class="login-help" href="install.php">راهنمای نصب و حساب مدیر</a>
            </form>
        </section>
    </main>
<?php elseif (!empty($user['must_change_password'])): ?>
    <main class="login-layout password-gate">
        <section class="login-intro">
            <div class="brand-lockup"><div class="brand-mark">م</div><div><strong>مدیریت پروژه</strong><small>ایمن‌سازی حساب کاربری</small></div></div>
            <div>
                <p class="eyebrow light">ورود نخست</p>
                <h1>رمز اولیه خود را تغییر دهید</h1>
                <p>برای حفاظت از اطلاعات پروژه، پیش از ورود به داشبورد یک رمز شخصی و غیرقابل حدس انتخاب کنید.</p>
            </div>
            <div class="login-stats"><span><strong>✓</strong> حداقل ۱۰ نویسه</span><span><strong>✓</strong> متفاوت از ایمیل</span></div>
        </section>
        <section class="login-panel">
            <form method="post" class="login-form">
                <p class="eyebrow">فعال‌سازی حساب</p>
                <h2>تعیین رمز شخصی</h2>
                <p>حساب: <span class="code"><?= htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') ?></span></p>
                <?php if ($passwordChangeError): ?><div class="alert error"><?= htmlspecialchars($passwordChangeError, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
                <label>رمز عبور جدید<input name="new_password" type="password" minlength="10" required autocomplete="new-password" autofocus></label>
                <label>تکرار رمز عبور جدید<input name="confirm_password" type="password" minlength="10" required autocomplete="new-password"></label>
                <button class="button primary wide" name="set_initial_password" value="1" type="submit">ذخیره رمز و ورود</button>
                <button class="button secondary wide" name="logout" value="1" type="submit" formnovalidate>خروج از این حساب</button>
            </form>
        </section>
    </main>
<?php else: ?>
    <div class="app-shell" id="app" data-role="<?= htmlspecialchars($user['role'], ENT_QUOTES, 'UTF-8') ?>">
        <aside class="sidebar" id="sidebar">
            <div class="brand-lockup"><div class="brand-mark">س</div><div><strong>سمپاد</strong><small>مدیریت پروژه</small></div></div>
            <nav id="mainNav" aria-label="منوی اصلی">
                <button class="nav-item active" data-view="dashboard"><span>⌂</span>داشبورد</button>
                <button class="nav-item" data-view="tasks"><span>▤</span>فعالیت‌ها <b id="taskNavCount">۰</b></button>
                <button class="nav-item" data-view="issues"><span>⚑</span>اشکالات</button>
                <button class="nav-item" data-view="meetings"><span>◷</span>جلسات و مصوبات</button>
                <button class="nav-item" data-view="settings" id="settingsNav"><span>⚙</span>تنظیمات پروژه</button>
            </nav>
            <div class="sidebar-note"><strong>پروژه فعال</strong><span id="sidebarProjectName">در حال دریافت…</span></div>
        </aside>
        <main class="main">
            <header class="topbar">
                <button class="mobile-menu" id="menuButton" type="button">☰</button>
                <div><small>سامانه چندپروژه‌ای کنترل و نظارت</small><h1 id="pageTitle">داشبورد</h1></div>
                <label class="project-switcher"><span>پروژه فعال</span><select id="projectSelect" aria-label="انتخاب پروژه"></select></label>
                <div class="user-menu">
                    <div class="avatar"><?= htmlspecialchars(mb_substr($user['display_name'], 0, 1), ENT_QUOTES, 'UTF-8') ?></div>
                    <div><strong><?= htmlspecialchars($user['display_name'], ENT_QUOTES, 'UTF-8') ?></strong><small id="roleLabel"></small></div>
                    <button class="account-action" id="changePassword" type="button" title="تغییر رمز عبور">تغییر رمز</button>
                    <form method="post"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>"><button class="logout" name="logout" value="1">خروج</button></form>
                </div>
            </header>
            <section class="content" id="viewRoot"><div class="loading">در حال دریافت اطلاعات پروژه…</div></section>
        </main>
    </div>
    <div class="modal-backdrop" id="modal" hidden><section class="modal"><header><h2 id="modalTitle">جزئیات</h2><button id="modalClose" type="button">×</button></header><div id="modalBody"></div></section></div>
    <div class="toast" id="toast" role="status"></div>
    <script>
        window.APP_BOOT = <?= json_encode([
            'csrf' => csrf_token(),
            'user' => $user,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
    </script>
    <script src="assets/app.js?v=2.2.0"></script>
<?php endif; ?>
</body>
</html>
