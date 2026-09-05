const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// GET /api/reports/visits?from=YYYY-MM-DD&to=YYYY-MM-DD&distributor_id=&staff_id=
router.get('/visits', (req, res) => {
  const user = req.session.user;
  const { from, to, distributor_id, staff_id } = req.query;

  let allowedDistributorIds = null; // null = all (admin, asm)
  if (user.role === 'distributor') {
    allowedDistributorIds = [user.distributor_id];
  } else if (user.role === 'tm') {
    allowedDistributorIds = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?')
      .all(user.tm_id).map(r => r.distributor_id);
  }

  let query = `
    SELECT visits.*, staff.name as staff_name, distributors.name as distributor_name
    FROM visits
    JOIN staff ON visits.staff_id = staff.id
    JOIN distributors ON visits.distributor_id = distributors.id
    WHERE 1=1
  `;
  const params = [];

  if (allowedDistributorIds) {
    if (allowedDistributorIds.length === 0) return res.json([]);
    query += ` AND visits.distributor_id IN (${allowedDistributorIds.map(() => '?').join(',')})`;
    params.push(...allowedDistributorIds);
  }
  if (distributor_id) {
    query += ' AND visits.distributor_id = ?';
    params.push(distributor_id);
  }
  if (staff_id) {
    query += ' AND visits.staff_id = ?';
    params.push(staff_id);
  }
  if (from) {
    query += " AND date(visits.in_time) >= date(?)";
    params.push(from);
  }
  if (to) {
    query += " AND date(visits.in_time) <= date(?)";
    params.push(to);
  }
  query += ' ORDER BY visits.in_time DESC LIMIT 500';

  res.json(db.prepare(query).all(...params));
});

// GET /api/reports/open-visits — staff who are currently checked IN to a shop (no OUT yet)
router.get('/open-visits', (req, res) => {
  const user = req.session.user;
  let allowedDistributorIds = null; // null = all (admin, asm)
  if (user.role === 'distributor') {
    allowedDistributorIds = [user.distributor_id];
  } else if (user.role === 'tm') {
    allowedDistributorIds = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?')
      .all(user.tm_id).map(r => r.distributor_id);
  }

  let query = `
    SELECT visits.*, staff.name as staff_name, distributors.name as distributor_name
    FROM visits
    JOIN staff ON visits.staff_id = staff.id
    JOIN distributors ON visits.distributor_id = distributors.id
    WHERE visits.out_time IS NULL
  `;
  const params = [];
  if (allowedDistributorIds) {
    if (allowedDistributorIds.length === 0) return res.json([]);
    query += ` AND visits.distributor_id IN (${allowedDistributorIds.map(() => '?').join(',')})`;
    params.push(...allowedDistributorIds);
  }
  query += ' ORDER BY visits.in_time DESC';

  res.json(db.prepare(query).all(...params));
});

// Staff list scoped to the logged-in user, for the dashboard "Staff" filter dropdown.
// Optionally narrowed further by ?distributor_id= (e.g. when the Distributor filter changes).
router.get('/staff-list', (req, res) => {
  const user = req.session.user;
  const { distributor_id } = req.query;

  let allowedDistributorIds = null; // null = all (admin, asm)
  if (user.role === 'distributor') {
    allowedDistributorIds = [user.distributor_id];
  } else if (user.role === 'tm') {
    allowedDistributorIds = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?')
      .all(user.tm_id).map(r => r.distributor_id);
  }

  let query = `
    SELECT staff.id, staff.name, staff.distributor_id, distributors.name as distributor_name
    FROM staff JOIN distributors ON staff.distributor_id = distributors.id
    WHERE staff.active = 1
  `;
  const params = [];

  if (allowedDistributorIds) {
    if (allowedDistributorIds.length === 0) return res.json([]);
    query += ` AND staff.distributor_id IN (${allowedDistributorIds.map(() => '?').join(',')})`;
    params.push(...allowedDistributorIds);
  }
  if (distributor_id) {
    query += ' AND staff.distributor_id = ?';
    params.push(distributor_id);
  }
  query += ' ORDER BY distributors.name, staff.name';

  res.json(db.prepare(query).all(...params));
});

// Distributor/TM filter dropdown data scoped to the logged-in user
router.get('/scope', (req, res) => {
  const user = req.session.user;
  if (user.role === 'admin' || user.role === 'asm') {
    return res.json({
      distributors: db.prepare('SELECT id, name FROM distributors ORDER BY name').all()
    });
  }
  if (user.role === 'distributor') {
    return res.json({
      distributors: db.prepare('SELECT id, name FROM distributors WHERE id = ?').all(user.distributor_id)
    });
  }
  if (user.role === 'tm') {
    const ids = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?').all(user.tm_id).map(r => r.distributor_id);
    if (!ids.length) return res.json({ distributors: [] });
    return res.json({
      distributors: db.prepare(`SELECT id, name FROM distributors WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    });
  }
  res.json({ distributors: [] });
});

// PUT /api/reports/visits/:id — correct a visit's details (Admin, or TM for their own distributors only)
router.put('/visits/:id', (req, res) => {
  const user = req.session.user;
  if (!['admin', 'tm'].includes(user.role)) return res.status(403).json({ error: 'Not authorized to edit visits' });

  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Visit not found' });

  if (user.role === 'tm') {
    const allowed = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?').all(user.tm_id).map(r => r.distributor_id);
    if (!allowed.includes(visit.distributor_id)) return res.status(403).json({ error: 'Not authorized for this distributor' });
  }

  const up = (v) => (v !== undefined && v !== null && v !== '' ? String(v).toUpperCase() : null);
  const orNull = (v) => (v !== undefined && v !== '' ? v : null);
  const {
    shop_type, outlet_status, shop_name, location_text, segment, contact_number,
    orders_ltrs, collection_rupees, active_tertiary, remarks_feedback
  } = req.body;

  db.prepare(`
    UPDATE visits SET
      shop_type = COALESCE(?, shop_type),
      outlet_status = COALESCE(?, outlet_status),
      shop_name = COALESCE(?, shop_name),
      location_text = COALESCE(?, location_text),
      segment = COALESCE(?, segment),
      contact_number = COALESCE(?, contact_number),
      orders_ltrs = COALESCE(?, orders_ltrs),
      collection_rupees = COALESCE(?, collection_rupees),
      active_tertiary = COALESCE(?, active_tertiary),
      remarks_feedback = COALESCE(?, remarks_feedback)
    WHERE id = ?
  `).run(
    up(shop_type), up(outlet_status), up(shop_name), up(location_text), up(segment),
    orNull(contact_number), orNull(orders_ltrs), orNull(collection_rupees),
    orNull(active_tertiary), orNull(remarks_feedback),
    req.params.id
  );

  const updated = db.prepare(`
    SELECT visits.*, staff.name as staff_name, distributors.name as distributor_name
    FROM visits JOIN staff ON visits.staff_id = staff.id JOIN distributors ON visits.distributor_id = distributors.id
    WHERE visits.id = ?
  `).get(req.params.id);
  res.json({ ok: true, visit: updated });
});

// POST /api/reports/visits/:id/release — force-close a stuck OPEN visit (no GPS check).
// Available to Admin, TM (their own distributors only), and Distributor (their own distributor only).
router.post('/visits/:id/release', (req, res) => {
  const user = req.session.user;
  if (!['admin', 'tm', 'distributor'].includes(user.role)) return res.status(403).json({ error: 'Not authorized to release visits' });

  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Visit not found' });
  if (visit.out_time) return res.status(409).json({ error: 'This visit is already checked out.' });

  if (user.role === 'tm') {
    const allowed = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?').all(user.tm_id).map(r => r.distributor_id);
    if (!allowed.includes(visit.distributor_id)) return res.status(403).json({ error: 'Not authorized for this distributor' });
  } else if (user.role === 'distributor') {
    if (visit.distributor_id !== user.distributor_id) return res.status(403).json({ error: 'Not authorized for this distributor' });
  }

  const { orders_ltrs, collection_rupees, active_tertiary, remarks_feedback } = req.body || {};
  const auditNote = `[Released by ${user.role.toUpperCase()} — ${user.username}, staff did not check out]`;
  const finalRemarks = remarks_feedback ? `${remarks_feedback} ${auditNote}` : auditNote;

  db.prepare(`
    UPDATE visits SET orders_ltrs = COALESCE(?, orders_ltrs), collection_rupees = COALESCE(?, collection_rupees),
      active_tertiary = COALESCE(?, active_tertiary), remarks_feedback = ?, out_time = datetime('now')
    WHERE id = ?
  `).run(
    orders_ltrs !== undefined && orders_ltrs !== '' ? orders_ltrs : null,
    collection_rupees !== undefined && collection_rupees !== '' ? collection_rupees : null,
    active_tertiary !== undefined && active_tertiary !== '' ? active_tertiary : null,
    finalRemarks,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT visits.*, staff.name as staff_name, distributors.name as distributor_name
    FROM visits JOIN staff ON visits.staff_id = staff.id JOIN distributors ON visits.distributor_id = distributors.id
    WHERE visits.id = ?
  `).get(req.params.id);
  res.json({ ok: true, visit: updated });
});

module.exports = router;
