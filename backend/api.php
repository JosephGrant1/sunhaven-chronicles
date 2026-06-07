<?php
// ============================================================
// Sunhaven Chronicles — REST API
// Endpoint: /backend/api.php?action=<action>
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: ' . (defined('CORS_ORIGIN') ? CORS_ORIGIN : '*'));
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    match ($action) {
        'register'    => actionRegister($body),
        'login'       => actionLogin($body),
        'save'        => actionSave($body),
        'load'        => actionLoad(),
        'leaderboard' => actionLeaderboard(),
        'chat_log'    => actionChatLog(),
        default       => json(['success' => false, 'error' => 'Unknown action'], 400),
    };
} catch (Throwable $e) {
    json(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}

// ---- Register -------------------------------------------------------
function actionRegister(array $b): void {
    $username = trim($b['username'] ?? '');
    $password = $b['password'] ?? '';

    if (strlen($username) < 3 || strlen($username) > 32)
        json(['success' => false, 'error' => 'Username must be 3–32 characters']);
    if (!preg_match('/^[A-Za-z0-9_]+$/', $username))
        json(['success' => false, 'error' => 'Username: letters, numbers, underscores only']);
    if (strlen($password) < 6)
        json(['success' => false, 'error' => 'Password must be at least 6 characters']);

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) json(['success' => false, 'error' => 'Username already taken']);

    $hash  = password_hash($password, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO users (username, password_hash, token) VALUES (?, ?, ?)')
        ->execute([$username, $hash, $token]);

    json(['success' => true, 'message' => 'Account created']);
}

// ---- Login ----------------------------------------------------------
function actionLogin(array $b): void {
    $username = trim($b['username'] ?? '');
    $password = $b['password'] ?? '';

    $stmt = db()->prepare('SELECT id, password_hash FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash']))
        json(['success' => false, 'error' => 'Invalid username or password']);

    $token = makeToken($user['id'], $username);
    db()->prepare('UPDATE users SET token = ?, last_login = NOW() WHERE id = ?')
       ->execute([$token, $user['id']]);

    // Load character if it exists
    $charStmt = db()->prepare('SELECT * FROM characters WHERE user_id = ?');
    $charStmt->execute([$user['id']]);
    $char = $charStmt->fetch();

    json([
        'success'   => true,
        'token'     => $token,
        'username'  => $username,
        'character' => $char ? mapCharacter($char) : null,
    ]);
}

// ---- Save character -------------------------------------------------
function actionSave(array $b): void {
    $claims = authRequired();
    $c = $b['character'] ?? null;
    if (!$c) json(['success' => false, 'error' => 'No character data']);

    $userId = $claims['user_id'];
    $pdo = db();

    $existing = $pdo->prepare('SELECT id FROM characters WHERE user_id = ?');
    $existing->execute([$userId]);
    $row = $existing->fetch();

    $kills      = json_encode($c['kills'] ?? []);
    $questState = json_encode($c['quests'] ?? []);
    $stats      = json_encode($c['stats'] ?? ['totalDmg' => 0, 'kills' => 0, 'deaths' => 0]);
    $unlocks    = json_encode($c['unlocks'] ?? []);

    if ($row) {
        $pdo->prepare('UPDATE characters SET
            name=?, class=?, level=?, xp=?, gold=?,
            hp=?, max_hp=?, mp=?, max_mp=?,
            atk_bonus=?, def_bonus=?,
            kills=?, quest_state=?, stats=?, unlocks=?
            WHERE user_id=?')
            ->execute([
                $c['name'] ?? 'Hero', $c['class'], $c['level'], $c['xp'], $c['gold'],
                $c['hp'], $c['maxHp'], $c['mp'], $c['maxMp'],
                $c['atk'] ?? 0, $c['def'] ?? 0,
                $kills, $questState, $stats, $unlocks,
                $userId
            ]);
    } else {
        $pdo->prepare('INSERT INTO characters
            (user_id, name, class, level, xp, gold, hp, max_hp, mp, max_mp, atk_bonus, def_bonus, kills, quest_state, stats, unlocks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $userId,
                $c['name'] ?? 'Hero', $c['class'], $c['level'], $c['xp'], $c['gold'],
                $c['hp'], $c['maxHp'], $c['mp'], $c['maxMp'],
                $c['atk'] ?? 0, $c['def'] ?? 0,
                $kills, $questState, $stats, $unlocks
            ]);
    }

    // Update leaderboard cache
    $totalKills = array_sum((array)($c['kills'] ?? []));
    $pdo->prepare('INSERT INTO leaderboard_cache (user_id, username, class, level, total_kills, gold)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE class=VALUES(class), level=VALUES(level),
        total_kills=VALUES(total_kills), gold=VALUES(gold), updated_at=NOW()')
        ->execute([
            $userId, $claims['username'], $c['class'],
            $c['level'], $totalKills, $c['gold']
        ]);

    json(['success' => true]);
}

// ---- Load character -------------------------------------------------
function actionLoad(): void {
    $claims = authRequired();
    $stmt = db()->prepare('SELECT * FROM characters WHERE user_id = ?');
    $stmt->execute([$claims['user_id']]);
    $char = $stmt->fetch();
    json(['success' => true, 'character' => $char ? mapCharacter($char) : null]);
}

// ---- Leaderboard ---------------------------------------------------
function actionLeaderboard(): void {
    $stmt = db()->query(
        'SELECT username, class, level, total_kills, gold, updated_at
         FROM leaderboard_cache ORDER BY level DESC, total_kills DESC LIMIT 20'
    );
    json(['success' => true, 'data' => $stmt->fetchAll()]);
}

// ---- Chat log -------------------------------------------------------
function actionChatLog(): void {
    $zone = $_GET['zone'] ?? 'town';
    $stmt = db()->prepare(
        'SELECT username, message, sent_at FROM chat_log
         WHERE zone = ? ORDER BY sent_at DESC LIMIT 50'
    );
    $stmt->execute([$zone]);
    json(['success' => true, 'data' => array_reverse($stmt->fetchAll())]);
}

// ---- Map DB row → game character object ----------------------------
function mapCharacter(array $row): array {
    return [
        'name'      => $row['name'],
        'class'     => $row['class'],
        'level'     => (int)$row['level'],
        'xp'        => (int)$row['xp'],
        'gold'      => (int)$row['gold'],
        'hp'        => (int)$row['hp'],
        'maxHp'     => (int)$row['max_hp'],
        'mp'        => (int)$row['mp'],
        'maxMp'     => (int)$row['max_mp'],
        'atk'       => (int)$row['atk_bonus'],
        'def'       => (int)$row['def_bonus'],
        'cooldowns' => [0, 0, 0],
        'inventory' => [],
        'kills'     => json_decode($row['kills'] ?? '{}', true) ?? [],
        'quests'    => json_decode($row['quest_state'] ?? '[]', true) ?: [],
        'stats'     => json_decode($row['stats'] ?? '{}', true) ?? ['totalDmg' => 0, 'kills' => 0, 'deaths' => 0],
        'unlocks'   => json_decode($row['unlocks'] ?? '[]', true) ?: [],
    ];
}
