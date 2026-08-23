const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// GET /api/reports/visits?from=YYYY-MM-DD&to=YYYY-MM-DD&distributor_id=&staff_id=
router.get('/visits', (req, res) => {
  const user = req.session.user;
  const { from, to, distributor_id, staff_id } = req.query;

  let allowedDistributorIds = null; // null = all (admin)
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
  let allowedDistributorIds = null;
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

// Distributor/TM filter dropdown data scoped to the logged-in user
router.get('/scope', (req, res) => {
  const user = req.session.user;
  if (user.role === 'admin') {
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

module.exports = router;
