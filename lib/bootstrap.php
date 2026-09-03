<?php

declare(strict_types=1);

function app_config(): array
{
    static $config;
    if ($config !== null) {
        return $config;
    }

    $path = dirname(__DIR__) . '/config.php';
    if (!is_file($path)) {
        throw new RuntimeException('CONFIG_MISSING');
    }

    $loaded = require $path;
    if (!is_array($loaded) || !isset($loaded['database'], $loaded['app'])) {
        throw new RuntimeException('CONFIG_INVALID');
    }

    $config = $loaded;
    date_default_timezone_set((string) ($config['app']['timezone'] ?? 'Asia/Tehran'));
    return $config;
}

function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $config = app_config();
    session_name((string) ($config['app']['session_name'] ?? 'sampad_project_session'));
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $database = app_config()['database'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $database['host'],
        (int) ($database['port'] ?? 3306),
        $database['name'],
        $database['charset'] ?? 'utf8mb4'
    );

    $pdo = new PDO($dsn, $database['user'], $database['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string) $_SESSION['csrf_token'];
}

function verify_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? '');
    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        json_response(['ok' => false, 'error' => 'نشست امنیتی معتبر نیست. صفحه را تازه‌سازی کنید.'], 419);
    }
}

function database_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (!array_key_exists($key, $cache)) {
        $statement = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $statement->execute([$table, $column]);
        $cache[$key] = (int) $statement->fetchColumn() > 0;
    }
    return $cache[$key];
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $pdo = db();
    $statement = $pdo->prepare('SELECT id, email, display_name, role FROM users WHERE id = ? AND active = 1');
    $statement->execute([(int) $_SESSION['user_id']]);
    $user = $statement->fetch();
    if ($user && database_column_exists($pdo, 'users', 'must_change_password')) {
        $passwordFlag = $pdo->prepare('SELECT must_change_password FROM users WHERE id = ?');
        $passwordFlag->execute([(int) $user['id']]);
        $user['must_change_password'] = (int) $passwordFlag->fetchColumn();
    } elseif ($user) {
        $user['must_change_password'] = 0;
    }
    return $user ?: null;
}

function require_user(): array
{
    $user = current_user();
    if ($user === null) {
        json_response(['ok' => false, 'error' => 'برای ادامه وارد سامانه شوید.'], 401);
    }
    return $user;
}

function require_role(array $user, array $roles): void
{
    if (!in_array($user['role'], $roles, true)) {
        json_response(['ok' => false, 'error' => 'دسترسی لازم برای این عملیات را ندارید.'], 403);
    }
}

function project_secret_key(): string
{
    $config = app_config();
    $database = $config['database'];
    $material = implode('|', [
        (string) ($database['name'] ?? ''),
        (string) ($database['user'] ?? ''),
        (string) ($database['password'] ?? ''),
        (string) ($config['app']['session_name'] ?? 'project_session'),
    ]);
    return hash('sha256', $material, true);
}

function encrypt_project_secret(string $plainText): string
{
    if (!function_exists('openssl_encrypt')) {
        throw new RuntimeException('افزونه OpenSSL در PHP فعال نیست.');
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipherText = openssl_encrypt(
        $plainText,
        'aes-256-gcm',
        project_secret_key(),
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );
    if ($cipherText === false) {
        throw new RuntimeException('رمزنگاری اطلاعات اتصال انجام نشد.');
    }
    return 'v1:' . base64_encode($iv . $tag . $cipherText);
}

function decrypt_project_secret(string $encrypted): string
{
    if (!str_starts_with($encrypted, 'v1:') || !function_exists('openssl_decrypt')) {
        throw new RuntimeException('اطلاعات رمزنگاری‌شده اتصال معتبر نیست.');
    }
    $payload = base64_decode(substr($encrypted, 3), true);
    if ($payload === false || strlen($payload) < 29) {
        throw new RuntimeException('اطلاعات رمزنگاری‌شده اتصال ناقص است.');
    }
    $iv = substr($payload, 0, 12);
    $tag = substr($payload, 12, 16);
    $cipherText = substr($payload, 28);
    $plainText = openssl_decrypt(
        $cipherText,
        'aes-256-gcm',
        project_secret_key(),
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );
    if ($plainText === false) {
        throw new RuntimeException('بازیابی توکن بله انجام نشد؛ توکن را دوباره ثبت کنید.');
    }
    return $plainText;
}

function bale_send_message(string $token, string $chatId, string $text): array
{
    $url = 'https://tapi.bale.ai/bot' . $token . '/sendMessage';
    $body = json_encode(['chat_id' => $chatId, 'text' => mb_substr($text, 0, 4096)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        throw new RuntimeException('ساخت پیام بله انجام نشد.');
    }

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('راه‌اندازی ارتباط با بله انجام نشد.');
        }
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 5,
        ]);
        $response = curl_exec($curl);
        $curlError = curl_error($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        if ($response === false) {
            throw new RuntimeException('ارتباط با بله برقرار نشد: ' . $curlError);
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
                'content' => $body,
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);
        $response = @file_get_contents($url, false, $context);
        $status = 0;
        if ($response === false) {
            throw new RuntimeException('ارتباط خروجی سرور با بله برقرار نشد.');
        }
    }

    $result = json_decode((string) $response, true);
    if (!is_array($result) || empty($result['ok'])) {
        $description = is_array($result) ? mb_substr((string) ($result['description'] ?? ''), 0, 300) : '';
        throw new RuntimeException($description !== '' ? $description : "پاسخ نامعتبر از بله دریافت شد (HTTP {$status}).");
    }
    return $result;
}

function bale_safe_text(string $value): string
{
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim($value)) ?? '';
    return strtr($value, ['*' => '＊', '_' => '＿', '[' => '〔', ']' => '〕', '`' => 'ˈ']);
}

function bale_notification_text(
    PDO $pdo,
    int $projectId,
    ?int $userId,
    string $entityType,
    string $entityId,
    string $action,
    array $details
): string {
    $projectStatement = $pdo->prepare('SELECT name FROM projects WHERE id = ?');
    $projectStatement->execute([$projectId]);
    $projectName = (string) ($projectStatement->fetchColumn() ?: 'پروژه');

    $actorName = 'سامانه';
    if ($userId !== null) {
        $actorStatement = $pdo->prepare('SELECT display_name FROM users WHERE id = ?');
        $actorStatement->execute([$userId]);
        $actorName = (string) ($actorStatement->fetchColumn() ?: 'کاربر سامانه');
    }

    $entityLabels = [
        'task' => 'فعالیت', 'issue' => 'اشکال', 'meeting' => 'صورت‌جلسه',
        'project' => 'پروژه', 'project_member' => 'عضو پروژه', 'user' => 'کاربر', 'system' => 'سامانه',
    ];
    $actionLabels = [
        'create' => 'ایجاد شد', 'update' => 'ویرایش شد', 'delete' => 'حذف شد',
        'status_change' => 'تغییر وضعیت', 'supervisor_approval' => 'ثبت نظر ناظر',
        'operator_approval' => 'ثبت نظر کارفرما / بهره‌بردار', 'set_access' => 'تغییر دسترسی',
        'remove' => 'حذف دسترسی', 'install' => 'نصب', 'migrate' => 'ارتقا',
    ];
    $valueLabels = [
        'todo' => 'انجام‌نشده', 'in_progress' => 'در حال انجام', 'review' => 'آماده بررسی',
        'done' => 'تکمیل‌شده', 'blocked' => 'متوقف', 'pending' => 'در انتظار',
        'approved' => 'تأییدشده', 'rejected' => 'ردشده', 'open' => 'باز',
        'resolved' => 'رفع‌شده', 'closed' => 'بسته', 'low' => 'کم', 'medium' => 'متوسط',
        'high' => 'زیاد', 'critical' => 'بحرانی', 'project_manager' => 'مدیر پروژه',
        'editor' => 'ویرایشگر', 'viewer' => 'مشاهده‌گر', 'manager' => 'مدیر سامانه',
        'contractor' => 'پیمانکار', 'supervisor' => 'ناظر', 'operator' => 'کارفرما / بهره‌بردار',
        'active' => 'فعال', 'paused' => 'متوقف موقت', 'completed' => 'تکمیل‌شده', 'archived' => 'بایگانی',
    ];

    $title = trim((string) ($details['title'] ?? ''));
    if ($title === '' && in_array($entityType, ['task', 'issue', 'meeting'], true)) {
        $tables = ['task' => 'tasks', 'issue' => 'issues', 'meeting' => 'meetings'];
        $titleStatement = $pdo->prepare("SELECT title FROM {$tables[$entityType]} WHERE id = ? AND project_id = ?");
        $titleStatement->execute([$entityId, $projectId]);
        $title = (string) ($titleStatement->fetchColumn() ?: '');
    } elseif ($title === '' && in_array($entityType, ['user', 'project_member'], true)) {
        $titleStatement = $pdo->prepare('SELECT display_name FROM users WHERE id = ?');
        $titleStatement->execute([(int) $entityId]);
        $title = (string) ($titleStatement->fetchColumn() ?: '');
    }

    $lines = [
        '🔔 تغییر جدید پروژه',
        '',
        'پروژه: ' . bale_safe_text($projectName),
        'عملیات: ' . ($actionLabels[$action] ?? bale_safe_text($action)),
        'بخش: ' . ($entityLabels[$entityType] ?? bale_safe_text($entityType)),
        'شناسه: ' . bale_safe_text($entityId),
    ];
    if ($title !== '') {
        $lines[] = 'عنوان: ' . bale_safe_text($title);
    }
    $detailLabels = [
        'wbs' => 'WBS', 'status' => 'وضعیت', 'progress' => 'پیشرفت', 'deadline' => 'ددلاین',
        'decision' => 'نتیجه', 'severity' => 'شدت', 'task_id' => 'فعالیت مرتبط',
        'access_role' => 'دسترسی', 'role' => 'نقش سازمانی',
    ];
    foreach ($detailLabels as $key => $label) {
        if (!array_key_exists($key, $details) || $details[$key] === null || $details[$key] === '') {
            continue;
        }
        $rawValue = (string) $details[$key];
        $value = $valueLabels[$rawValue] ?? bale_safe_text($rawValue);
        if ($key === 'progress') {
            $value .= '٪';
        }
        $lines[] = $label . ': ' . $value;
    }
    $lines[] = 'ثبت‌کننده: ' . bale_safe_text($actorName);
    $lines[] = 'زمان: ' . date('Y-m-d H:i');
    return implode("\n", $lines);
}

function notify_project_bale(
    PDO $pdo,
    int $projectId,
    ?int $userId,
    string $entityType,
    string $entityId,
    string $action,
    array $details
): bool {
    $statement = $pdo->prepare(
        'SELECT bale_bot_token, bale_chat_id, bale_enabled FROM projects WHERE id = ?'
    );
    $statement->execute([$projectId]);
    $settings = $statement->fetch();
    if (!$settings || !(bool) $settings['bale_enabled'] || empty($settings['bale_bot_token']) || empty($settings['bale_chat_id'])) {
        return false;
    }
    $token = decrypt_project_secret((string) $settings['bale_bot_token']);
    $text = bale_notification_text($pdo, $projectId, $userId, $entityType, $entityId, $action, $details);
    bale_send_message($token, (string) $settings['bale_chat_id'], $text);
    return true;
}

function log_activity(
    PDO $pdo,
    ?int $userId,
    string $entityType,
    string $entityId,
    string $action,
    array $details = [],
    ?int $projectId = null
): void
{
    $statement = $pdo->prepare(
        'INSERT INTO activity_logs (project_id, user_id, entity_type, entity_id, action, details_json) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $projectId,
        $userId,
        $entityType,
        $entityId,
        $action,
        $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
    ]);
    if ($projectId !== null) {
        try {
            notify_project_bale($pdo, $projectId, $userId, $entityType, $entityId, $action, $details);
        } catch (Throwable $exception) {
            error_log('Bale notification failed for project ' . $projectId . ': ' . $exception->getMessage());
        }
    }
}
