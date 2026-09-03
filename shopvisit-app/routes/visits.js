const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { UPLOAD_DIR: uploadDir } = require('../paths');

const router = express.Router();

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function findOpenVisit(staffId) {
  return db.prepare('SELECT * FROM visits WHERE staff_id = ? AND out_time IS NULL ORDER BY in_time DESC LIMIT 1').get(staffId);
}

// Haversine distance in meters between two lat/lng points
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Finds shops previously visited (by ANY staff under this distributor) near the given GPS point,
// so a returning staff member doesn't have to retype the same shop's details.
router.get('/nearby-shops', (req, res) => {
  const { distributor_id, lat, lng, radius } = req.query;
  if (!distributor_id || !lat || !lng) return res.status(400).json({ error: 'distributor_id, lat, lng required' });
  const radiusM = Number(radius) || 100;

  const candidates = db.prepare(`
    SELECT shop_name, shop_type, outlet_status, location_text, segment, contact_number, latitude, longitude, MAX(in_time) as last_visit
    FROM visits
    WHERE distributor_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY shop_name
    ORDER BY last_visit DESC
  `).all(distributor_id);

  const nearby = candidates
    .map(c => ({ ...c, distance_m: Math.round(distanceMeters(Number(lat), Number(lng), c.latitude, c.longitude)) }))
    .filter(c => c.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 5);

  res.json(nearby);
});

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
