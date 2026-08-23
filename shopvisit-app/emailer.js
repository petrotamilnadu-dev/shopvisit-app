const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP_USER / SMTP_PASS not set in .env — emails will NOT be sent.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMail({ to, subject, html, attachments }) {
  const transporter = getTransporter();
  if (!transporter) return { skipped: true };
  if (!to || (Array.isArray(to) && to.length === 0)) return { skipped: true, reason: 'no recipients' };
  try {
    await transporter.sendMail({
      from: `"Shop Visit Reports" <${process.env.SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(',') : to,
      subject,
      html,
      attachments
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { error: err.message };
  }
}

function fmtTime(t) {
  if (!t) return '-';
  return new Date(t + 'Z').toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function visitRowsHtml(visits) {
  return visits.map(v => `
    <tr>
      <td>${v.staff_name}</td>
      <td>${v.shop_name}</td>
      <td>${v.shop_type || '-'}</td>
      <td>${v.outlet_status || '-'}</td>
      <td>${v.segment || '-'}</td>
      <td>${v.contact_number || '-'}</td>
      <td>${v.location_text || '-'}</td>
      <td>${fmtTime(v.in_time)}</td>
      <td>${fmtTime(v.out_time)}</td>
      <td>${v.orders_ltrs ?? '-'}</td>
      <td>${v.collection_rupees ?? '-'}</td>
      <td>${v.active_tertiary || '-'}</td>
      <td>${v.remarks_feedback || '-'}</td>
    </tr>`).join('');
}

const TABLE_HEAD = `
  <tr style="background:#eee;">
    <th>Staff</th><th>Shop</th><th>Type</th><th>Outlet</th><th>Segment</th><th>Contact</th>
    <th>Location</th><th>IN Time</th><th>OUT Time</th><th>Orders (Ltrs)</th><th>Collection (Rs)</th>
    <th>Active/Tertiary</th><th>Remarks</th>
  </tr>`;

// Daily summary email for one distributor (all their staff visits for the day)
async function sendDistributorDailySummary({ distributorEmail, distributorName, visits, dateStr }) {
  if (!visits.length) return { skipped: true, reason: 'no visits' };
  const openCount = visits.filter(v => !v.out_time).length;
  const html = `
    <h3>Daily Shop Visit Summary — ${distributorName} (${dateStr})</h3>
    <p>Total Visits: <b>${visits.length}</b>${openCount ? ` &nbsp;|&nbsp; <span style="color:#b5482e;">Still open (no OUT time): ${openCount}</span>` : ''}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${TABLE_HEAD}
      ${visitRowsHtml(visits)}
    </table>
  `;
  return sendMail({ to: distributorEmail, subject: `Daily Shop Visit Summary — ${distributorName} — ${dateStr}`, html });
}

// Daily summary email for one TM (across all their assigned distributors)
async function sendTmDailySummary({ tmEmail, tmName, visitsByDistributor, dateStr }) {
  const totalVisits = Object.values(visitsByDistributor).reduce((a, v) => a + v.length, 0);
  if (!totalVisits) return { skipped: true, reason: 'no visits' };
  let html = `<h3>Daily Shop Visit Summary — ${tmName} (${dateStr})</h3><p>Total Visits: <b>${totalVisits}</b></p>`;
  for (const [distName, visits] of Object.entries(visitsByDistributor)) {
    if (!visits.length) continue;
    html += `<h4>${distName} (${visits.length} visits)</h4>`;
    html += `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${TABLE_HEAD}
      ${visitRowsHtml(visits)}
    </table><br/>`;
  }
  return sendMail({ to: tmEmail, subject: `Daily Shop Visit Summary — ${tmName} — ${dateStr}`, html });
}

// Morning Excel report — sent to Admin (all distributors) or a TM (their assigned distributors)
async function sendMorningExcelReport({ to, recipientLabel, excelBuffer, fileName, visitCount, monthLabel }) {
  const html = `
    <h3>Month-to-Date Shop Visit Report — ${monthLabel}</h3>
    <p>Hi ${recipientLabel},</p>
    <p>Please find attached the Excel report of all shop visit entries for <b>${monthLabel}</b> (month-to-date).</p>
    <p>Total visits so far this month: <b>${visitCount}</b></p>
    <p>The Excel file has a detailed sheet (every visit) and a Summary sheet (totals by Distributor).</p>
  `;
  return sendMail({
    to,
    subject: `Month-to-Date Shop Visit Report — ${monthLabel}`,
    html,
    attachments: [{ filename: fileName, content: excelBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]
  });
}

module.exports = { sendDistributorDailySummary, sendTmDailySummary, sendMorningExcelReport };
