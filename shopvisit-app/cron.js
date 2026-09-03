const cron = require('node-cron');
const db = require('./db');
const { sendDistributorDailySummary, sendTmDailySummary, sendMorningExcelReport } = require('./emailer');
const { buildVisitsExcelBuffer } = require('./excelReport');

async function runDailySummary() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

  console.log(`[cron] Running daily summary for ${todayStr}`);

  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const stats = { smtpConfigured, sent: 0, skipped: 0, errors: [] };

  // --- Distributor summaries ---
  const distributors = db.prepare('SELECT * FROM distributors WHERE active = 1').all();
  for (const dist of distributors) {
    const visits = db.prepare(`
      SELECT visits.*, staff.name as staff_name
      FROM visits JOIN staff ON visits.staff_id = staff.id
      WHERE visits.distributor_id = ? AND date(visits.in_time) = date('now', 'localtime')
      ORDER BY visits.in_time
    `).all(dist.id);
    const result = await sendDistributorDailySummary({
      distributorEmail: dist.email,
      distributorName: dist.name,
      visits,
      dateStr: todayStr
    });
    if (result.sent) stats.sent++;
    else if (result.error) stats.errors.push(`${dist.name}: ${result.error}`);
    else stats.skipped++;
  }

  // --- TM summaries (across their assigned distributors) ---
  const tms = db.prepare('SELECT * FROM tms WHERE active = 1').all();
  for (const tm of tms) {
    const dists = db.prepare(`
      SELECT distributors.* FROM distributors
      JOIN tm_distributors ON distributors.id = tm_distributors.distributor_id
      WHERE tm_distributors.tm_id = ?
    `).all(tm.id);

    const visitsByDistributor = {};
    for (const d of dists) {
      visitsByDistributor[d.name] = db.prepare(`
        SELECT visits.*, staff.name as staff_name
        FROM visits JOIN staff ON visits.staff_id = staff.id
        WHERE visits.distributor_id = ? AND date(visits.in_time) = date('now', 'localtime')
        ORDER BY visits.in_time
      `).all(d.id);
    }

    const result = await sendTmDailySummary({
      tmEmail: tm.email,
      tmName: tm.name,
      visitsByDistributor,
      dateStr: todayStr
    });
    if (result.sent) stats.sent++;
    else if (result.error) stats.errors.push(`${tm.name}: ${result.error}`);
    else stats.skipped++;
  }

  console.log('[cron] Daily summary run complete', stats);
  return stats;
}

// Month-to-date Excel report — one to Admin (all distributors), one per TM (their assigned distributors only)
async function runMorningExcelReport() {
  const now = new Date();
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const monthLabel = istNow.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const fileDateStr = istNow.toISOString().slice(0, 10);

  console.log(`[cron] Running morning Excel report for ${monthLabel}`);

  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const stats = { smtpConfigured, sent: 0, skipped: 0, errors: [] };

  const baseQuery = `
    SELECT visits.*, staff.name as staff_name, distributors.name as distributor_name
    FROM visits
    JOIN staff ON visits.staff_id = staff.id
    JOIN distributors ON visits.distributor_id = distributors.id
    WHERE date(visits.in_time) >= date('now', 'start of month', 'localtime')
  `;

  // --- Admin report: all distributors ---
  if (process.env.ADMIN_REPORT_EMAIL) {
    const allVisits = db.prepare(baseQuery + ' ORDER BY visits.in_time').all();
    const buffer = await buildVisitsExcelBuffer(allVisits, 'All Distributors');
    const result = await sendMorningExcelReport({
      to: process.env.ADMIN_REPORT_EMAIL,
      recipientLabel: 'Admin',
      excelBuffer: buffer,
      fileName: `Shop_Visit_Report_${fileDateStr}.xlsx`,
      visitCount: allVisits.length,
      monthLabel
    });
    if (result.sent) stats.sent++;
    else if (result.error) stats.errors.push(`Admin: ${result.error}`);
    else stats.skipped++;
  } else {
    console.warn('[cron] ADMIN_REPORT_EMAIL not set — skipping admin morning Excel report');
    stats.errors.push('ADMIN_REPORT_EMAIL is not set — Admin report was skipped entirely.');
  }

  // --- TM reports: scoped to each TM's assigned distributors ---
  const tms = db.prepare('SELECT * FROM tms WHERE active = 1').all();
  for (const tm of tms) {
    const distIds = db.prepare('SELECT distributor_id FROM tm_distributors WHERE tm_id = ?').all(tm.id).map(r => r.distributor_id);
    if (!distIds.length) { stats.skipped++; continue; }
    const placeholders = distIds.map(() => '?').join(',');
    const tmVisits = db.prepare(baseQuery + ` AND visits.distributor_id IN (${placeholders}) ORDER BY visits.in_time`).all(...distIds);
    const buffer = await buildVisitsExcelBuffer(tmVisits, tm.name);
    const result = await sendMorningExcelReport({
      to: tm.email,
      recipientLabel: tm.name,
      excelBuffer: buffer,
      fileName: `Shop_Visit_Report_${fileDateStr}.xlsx`,
      visitCount: tmVisits.length,
      monthLabel
    });
    if (result.sent) stats.sent++;
    else if (result.error) stats.errors.push(`${tm.name}: ${result.error}`);
    else stats.skipped++;
  }

  console.log('[cron] Morning Excel report run complete', stats);
  return stats;
}

function scheduleDailySummary() {
  // Default: every day at 9:00 PM IST. Change SUMMARY_CRON_TIME in .env to customize (cron syntax, IST).
  const cronTime = process.env.SUMMARY_CRON_TIME || '0 21 * * *';
  cron.schedule(cronTime, () => {
    runDailySummary().catch(e => console.error('[cron] error:', e));
  }, { timezone: 'Asia/Kolkata' });
  console.log(`[cron] Daily summary scheduled: "${cronTime}" (Asia/Kolkata)`);

  // Morning month-to-date Excel report. Default: 7:00 AM IST. Change MORNING_REPORT_CRON_TIME in .env.
  const morningCronTime = process.env.MORNING_REPORT_CRON_TIME || '0 7 * * *';
  cron.schedule(morningCronTime, () => {
    runMorningExcelReport().catch(e => console.error('[cron] error:', e));
  }, { timezone: 'Asia/Kolkata' });
  console.log(`[cron] Morning Excel report scheduled: "${morningCronTime}" (Asia/Kolkata)`);
}

module.exports = { scheduleDailySummary, runDailySummary, runMorningExcelReport };
