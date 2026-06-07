-- ============================================================
-- Sunhaven Chronicles — MySQL Schema
-- Import via phpMyAdmin: Database > Import > schema.sql
-- ============================================================

-- ---- Users ----
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  token        VARCHAR(255) NOT NULL DEFAULT '',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login   TIMESTAMP NULL
);

-- ---- Characters ----
CREATE TABLE IF NOT EXISTS characters (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  name         VARCHAR(32) NOT NULL DEFAULT 'Hero',
  class        ENUM('warrior','mage','rogue','necromancer') NOT NULL,
  level        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  xp           INT UNSIGNED NOT NULL DEFAULT 0,
  gold         INT UNSIGNED NOT NULL DEFAULT 50,
  hp           SMALLINT UNSIGNED NOT NULL,
  max_hp       SMALLINT UNSIGNED NOT NULL,
  mp           SMALLINT UNSIGNED NOT NULL,
  max_mp       SMALLINT UNSIGNED NOT NULL,
  atk_bonus    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  def_bonus    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kills        JSON,
  quest_state  JSON,
  stats        JSON,
  unlocks      JSON,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---- Leaderboard view ----
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL UNIQUE,
  username     VARCHAR(32) NOT NULL,
  class        VARCHAR(10) NOT NULL,
  level        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  total_kills  INT UNSIGNED NOT NULL DEFAULT 0,
  gold         INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---- Chat log (optional, for history) ----
CREATE TABLE IF NOT EXISTS chat_log (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(32) NOT NULL,
  zone       VARCHAR(32) NOT NULL DEFAULT 'town',
  message    TEXT NOT NULL,
  sent_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_zone_time (zone, sent_at)
);

-- ---- Migration for existing installs ----
-- ALTER TABLE characters MODIFY COLUMN class ENUM('warrior','mage','rogue','necromancer') NOT NULL;
-- ALTER TABLE characters ADD COLUMN unlocks JSON AFTER stats;

-- ---- Sample data for testing ----
-- Password for both is "password123"
INSERT IGNORE INTO users (username, password_hash, token) VALUES
  ('TestWarrior', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', ''),
  ('TestMage',    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '');
