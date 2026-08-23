const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'shopvisit.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS distributors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tm_distributors (
  tm_id INTEGER NOT NULL,
  distributor_id INTEGER NOT NULL,
  PRIMARY KEY (tm_id, distributor_id),
  FOREIGN KEY (tm_id) REFERENCES tms(id) ON DELETE CASCADE,
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  pin_code TEXT UNIQUE NOT NULL,
  distributor_id INTEGER NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  distributor_id INTEGER NOT NULL,

  -- IN time fields
  shop_type TEXT,            -- 'Retailer' | 'Mechanic'
  outlet_status TEXT,        -- 'New' | 'Existing'
  shop_name TEXT NOT NULL,
  location_text TEXT,
  segment TEXT,              -- 'CVL' | 'PCMO' | 'MCO'
  contact_number TEXT,
  photo_path TEXT,
  latitude REAL,
  longitude REAL,
  in_time TEXT DEFAULT (datetime('now')),

  -- OUT time fields (filled when staff checks out of this shop)
  orders_ltrs REAL,
  collection_rupees REAL,
  active_tertiary TEXT,
  remarks_feedback TEXT,
  out_time TEXT,

  FOREIGN KEY (staff_id) REFERENCES staff(id),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','distributor','tm')),
  distributor_id INTEGER,
  tm_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Seed default admin user if none exists
const adminExists = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
if (adminExists.c === 0) {
  const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(defaultPass, 10);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')")
    .run('admin', hash);
  console.log(`Seeded default admin user -> username: admin / password: ${defaultPass} (CHANGE THIS after first login)`);
}

module.exports = db;
