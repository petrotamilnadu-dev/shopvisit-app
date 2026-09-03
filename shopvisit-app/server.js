require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db'); // ensures DB + default admin are set up
const { scheduleDailySummary, runDailySummary, runMorningExcelReport } = require('./cron');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const visitRoutes = require('./routes/visits');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-env',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 hours
}));

const { UPLOAD_DIR } = require('./paths');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/reports', reportRoutes);

// Manual trigger to test the daily summary email without waiting for the cron time
app.post('/api/admin/test-daily-summary', require('./middleware/auth').requireRole('admin'), async (req, res) => {
  try {
    await runDailySummary();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual trigger to test the morning Excel report without waiting for the cron time
app.post('/api/admin/test-morning-report', require('./middleware/auth').requireRole('admin'), async (req, res) => {
  try {
    await runMorningExcelReport();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Shop Visit App running on port ${PORT}`);
  scheduleDailySummary();
});
