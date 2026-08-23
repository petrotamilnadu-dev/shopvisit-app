const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function findOpenVisit(staffId) {
  return db.prepare('SELECT * FROM visits WHERE staff_id = ? AND out_time IS NULL ORDER BY in_time DESC LIMIT 1').get(staffId);
}

// Step 1: staff enters their 4-digit PIN. Returns staff identity + whether a shop is
// currently "open" (checked IN but not yet checked OUT), so the frontend knows which
// form to show next.
router.post('/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const staff = db.prepare('SELECT * FROM staff WHERE pin_code = ? AND active = 1').get(String(pin));
  if (!staff) return res.status(404).json({ error: 'Invalid PIN. Please check and try again.' });

  const distributor = db.prepare('SELECT * FROM distributors WHERE id = ?').get(staff.distributor_id);
  const openVisit = findOpenVisit(staff.id);

  res.json({
    staff: { id: staff.id, name: staff.name, distributor_id: staff.distributor_id, distributor_name: distributor?.name },
    openVisit: openVisit || null
  });
});

// Step 2a: Check IN to a new shop. Blocked if this staff already has an open (un-checked-out) shop.
router.post('/checkin', upload.single('photo'), (req, res) => {
  try {
    const { staff_id, shop_type, outlet_status, shop_name, location_text, segment, contact_number, latitude, longitude } = req.body;
    if (!staff_id || !shop_name) return res.status(400).json({ error: 'staff_id and shop_name required' });

    const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').get(staff_id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const openVisit = findOpenVisit(staff_id);
    if (openVisit) {
      return res.status(409).json({
        error: `You still have an open visit at "${openVisit.shop_name}". Please give OUT time for that shop before checking in to a new one.`,
        openVisit
      });
    }

    const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

    const info = db.prepare(`
      INSERT INTO visits (staff_id, distributor_id, shop_type, outlet_status, shop_name, location_text, segment, contact_number, photo_path, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      staff_id, staff.distributor_id, shop_type || null, outlet_status || null, shop_name,
      location_text || null, segment || null, contact_number || null, photo_path,
      latitude || null, longitude || null
    );

    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(info.lastInsertRowid);
    res.json({ ok: true, visit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving check-in' });
  }
});

// Step 2b: Check OUT of the currently open shop.
router.post('/checkout', (req, res) => {
  try {
    const { visit_id, staff_id, orders_ltrs, collection_rupees, active_tertiary, remarks_feedback } = req.body;
    if (!visit_id || !staff_id) return res.status(400).json({ error: 'visit_id and staff_id required' });

    const visit = db.prepare('SELECT * FROM visits WHERE id = ? AND staff_id = ?').get(visit_id, staff_id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (visit.out_time) return res.status(409).json({ error: 'This visit is already checked out.' });

    db.prepare(`
      UPDATE visits SET orders_ltrs = ?, collection_rupees = ?, active_tertiary = ?, remarks_feedback = ?, out_time = datetime('now')
      WHERE id = ?
    `).run(orders_ltrs || null, collection_rupees || null, active_tertiary || null, remarks_feedback || null, visit_id);

    const updated = db.prepare('SELECT * FROM visits WHERE id = ?').get(visit_id);
    res.json({ ok: true, visit: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving check-out' });
  }
});

module.exports = router;
