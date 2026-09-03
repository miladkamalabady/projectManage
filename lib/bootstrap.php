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

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $statement = db()->prepare('SELECT id, email, display_name, role FROM users WHERE id = ? AND active = 1');
    $statement->execute([(int) $_SESSION['user_id']]);
    $user = $statement->fetch();
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

function log_activity(PDO $pdo, ?int $userId, string $entityType, string $entityId, string $action, array $details = []): void
{
    $statement = $pdo->prepare(
        'INSERT INTO activity_logs (user_id, entity_type, entity_id, action, details_json) VALUES (?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $userId,
        $entityType,
        $entityId,
        $action,
        $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
    ]);
}
