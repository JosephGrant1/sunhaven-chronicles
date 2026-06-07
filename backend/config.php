<?php
// ============================================================
// DB Config — edit these to match your phpMyAdmin / MySQL setup
// ============================================================
define('DB_HOST', 'localhost');
define('DB_NAME', 'sunhaven');
define('DB_USER', 'root');        // your MySQL username
define('DB_PASS', '');            // your MySQL password
define('DB_PORT', 3306);

define('TOKEN_SECRET', 'CHANGE_THIS_TO_A_RANDOM_SECRET_STRING_32CHARS+');
define('CORS_ORIGIN', '*');       // restrict to your domain in production

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
