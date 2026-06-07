<?php
// ============================================================
// DB Config — edit these to match your phpMyAdmin / MySQL setup
// ============================================================
// Railway provides MYSQL_URL as a full connection string.
// Individual vars (MYSQLHOST etc.) are fallbacks for local dev.
$_mysqlUrl = getenv('MYSQL_URL') ?: getenv('DATABASE_URL') ?: null;
if ($_mysqlUrl) {
    $_p = parse_url($_mysqlUrl);
    define('DB_HOST', $_p['host']);
    define('DB_NAME', ltrim($_p['path'], '/'));
    define('DB_USER', $_p['user']);
    define('DB_PASS', $_p['pass'] ?? '');
    define('DB_PORT', (int)($_p['port'] ?? 3306));
} else {
    define('DB_HOST', getenv('MYSQLHOST')     ?: getenv('MYSQL_HOST')     ?: 'localhost');
    define('DB_NAME', getenv('MYSQLDATABASE') ?: getenv('MYSQL_DATABASE') ?: 'sunhaven');
    define('DB_USER', getenv('MYSQLUSER')     ?: getenv('MYSQL_USER')     ?: 'root');
    define('DB_PASS', getenv('MYSQLPASSWORD') ?: getenv('MYSQL_PASSWORD') ?: 'root');
    define('DB_PORT', (int)(getenv('MYSQLPORT') ?: getenv('MYSQL_PORT')   ?: 3306));
}

define('TOKEN_SECRET', getenv('TOKEN_SECRET') ?: 'CHANGE_THIS_IN_RAILWAY_VARS');
define('CORS_ORIGIN', getenv('CORS_ORIGIN')   ?: '*');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function makeToken(int $userId, string $username): string {
    $payload = $userId . '|' . $username . '|' . time();
    return base64_encode($payload . '|' . hash_hmac('sha256', $payload, TOKEN_SECRET));
}

function verifyToken(string $token): ?array {
    $decoded = base64_decode($token);
    if (!$decoded) return null;
    $parts = explode('|', $decoded);
    if (count($parts) !== 4) return null;
    [$userId, $username, $ts, $sig] = $parts;
    $payload = "$userId|$username|$ts";
    if (!hash_equals(hash_hmac('sha256', $payload, TOKEN_SECRET), $sig)) return null;
    if (time() - (int)$ts > 86400 * 7) return null; // 7-day expiry
    return ['user_id' => (int)$userId, 'username' => $username];
}

function json(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function authRequired(): array {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) json(['success' => false, 'error' => 'Unauthorized'], 401);
    $claims = verifyToken(substr($auth, 7));
    if (!$claims) json(['success' => false, 'error' => 'Invalid or expired token'], 401);
    return $claims;
}
