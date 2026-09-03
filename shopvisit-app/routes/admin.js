const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

/* ---------- Distributors ---------- */
router.get('/distributors', (req, res) => {
  res.json(db.prepare('SELECT * FROM distributors ORDER BY name').all());
});

router.post('/distributors', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const info = db.prepare('INSERT INTO distributors (name, email) VALUES (?, ?)').run(name, email);
  res.json({ id: info.lastInsertRowid });
});

router.put('/distributors/:id', (req, res) => {
  const { name, email, active } = req.body;
  db.prepare('UPDATE distributors SET name = ?, email = ?, active = ? WHERE id = ?')
    .run(name, email, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/distributors/:id', (req, res) => {
  db.prepare('DELETE FROM distributors WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- TMs ---------- */
router.get('/tms', (req, res) => {
  const tms = db.prepare('SELECT * FROM tms ORDER BY name').all();
  const withDist = tms.map(tm => ({
    ...tm,
    distributor_ids: db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?')
      .all(tm.id).map(r => r.distributor_id)
  }));
  res.json(withDist);
});

router.post('/tms', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const info = db.prepare('INSERT INTO tms (name, email) VALUES (?, ?)').run(name, email);
  res.json({ id: info.lastInsertRowid });
});

router.put('/tms/:id', (req, res) => {
  const { name, email, active } = req.body;
  db.prepare('UPDATE tms SET name = ?, email = ?, active = ? WHERE id = ?')
    .run(name, email, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/tms/:id', (req, res) => {
  db.prepare('DELETE FROM tms WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Assign / unassign distributors to a TM
router.post('/tms/:id/assign', (req, res) => {
  const { distributor_ids } = req.body; // full list of distributor ids this TM should cover
  const tmId = req.params.id;
  const tx = db.transaction((ids) => {
    db.prepare('DELETE FROM tm_distributors WHERE tm_id = ?').run(tmId);
    const stmt = db.prepare('INSERT INTO tm_distributors (tm_id, distributor_id) VALUES (?, ?)');
    for (const distId of ids) stmt.run(tmId, distId);
  });
  tx(distributor_ids || []);
  res.json({ ok: true });
});

/* ---------- Staff ---------- */
router.get('/staff', (req, res) => {
  const { distributor_id } = req.query;
  let rows;
  if (distributor_id) {
    rows = db.prepare('SELECT * FROM staff WHERE distributor_id = ? ORDER BY name').all(distributor_id);
  } else {
    rows = db.prepare(`
      SELECT staff.*, distributors.name as distributor_name
      FROM staff JOIN distributors ON staff.distributor_id = distributors.id
      ORDER BY distributors.name, staff.name
    `).all();
  }
  res.json(rows);
});

function generateUniquePin() {
  for (let i = 0; i < 50; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const exists = db.prepare('SELECT 1 FROM staff WHERE pin_code = ?').get(pin);
    if (!exists) return pin;
  }
  throw new Error('Could not generate a unique PIN, try again');
}

router.post('/staff', (req, res) => {
  const { name, phone, distributor_id, pin_code } = req.body;
  if (!name || !distributor_id) return res.status(400).json({ error: 'name and distributor_id required' });
  let pin = pin_code && String(pin_code).trim();
  if (pin) {
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    const exists = db.prepare('SELECT 1 FROM staff WHERE pin_code = ?').get(pin);
    if (exists) return res.status(400).json({ error: 'This PIN is already used by another staff member' });
  } else {
    pin = generateUniquePin();
  }
  const info = db.prepare('INSERT INTO staff (name, phone, distributor_id, pin_code) VALUES (?, ?, ?, ?)')
    .run(name, phone || null, distributor_id, pin);
  res.json({ id: info.lastInsertRowid, pin_code: pin });
});

router.put('/staff/:id', (req, res) => {
  const { name, phone, distributor_id, active } = req.body;
  db.prepare('UPDATE staff SET name = ?, phone = ?, distributor_id = ?, active = ? WHERE id = ?')
    .run(name, phone || null, distributor_id, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.post('/staff/:id/reset-pin', (req, res) => {
  const pin = generateUniquePin();
  db.prepare('UPDATE staff SET pin_code = ? WHERE id = ?').run(pin, req.params.id);
  res.json({ ok: true, pin_code: pin });
});

router.delete('/staff/:id', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Login users for Distributor / TM dashboard access ---------- */
router.get('/users', (req, res) => {
  res.json(db.prepare("SELECT id, username, role, distributor_id, tm_id FROM users").all());
});

router.post('/users', (req, res) => {
  const { username, password, role, distributor_id, tm_id } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'username, password, role required' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, role, distributor_id, tm_id) VALUES (?, ?, ?, ?, ?)'
    ).run(username, hash, role, distributor_id || null, tm_id || null);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

router.delete('/users/:id', (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/reset-password', (req, res) => {
  const { newPassword } = req.body;
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

/* ---------- Storage management (uploads folder can fill up on free hosting) ---------- */
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR: uploadDir } = require('../paths');

router.get('/storage-info', (req, res) => {
  try {
    const files = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).filter(f => f !== '.gitkeep') : [];
    let totalBytes = 0;
    for (const f of files) {
      const stat = fs.statSync(path.join(uploadDir, f));
      totalBytes += stat.size;
    }
    res.json({ fileCount: files.length, totalMB: (totalBytes / (1024 * 1024)).toFixed(1) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deletes photo FILES for visits older than N days (keeps all visit data/history — only the photo image is removed)
router.post('/cleanup-old-photos', (req, res) => {
  const { olderThanDays } = req.body;
  const days = parseInt(olderThanDays) || 90;
  try {
    const oldVisits = db.prepare(`
      SELECT id, photo_path FROM visits
      WHERE photo_path IS NOT NULL AND date(in_time) < date('now', ?)
    `).all(`-${days} days`);

    let deleted = 0;
    for (const v of oldVisits) {
      const filePath = path.join(uploadDir, path.basename(v.photo_path));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      }
      db.prepare('UPDATE visits SET photo_path = NULL WHERE id = ?').run(v.id);
    }
    res.json({ ok: true, deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
