const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Distributor', key: 'distributor_name', width: 20 },
  { header: 'Staff', key: 'staff_name', width: 18 },
  { header: 'Shop Name', key: 'shop_name', width: 22 },
  { header: 'Shop Type', key: 'shop_type', width: 12 },
  { header: 'Outlet Status', key: 'outlet_status', width: 13 },
  { header: 'Segment', key: 'segment', width: 10 },
  { header: 'Contact Number', key: 'contact_number', width: 15 },
  { header: 'Location', key: 'location_text', width: 20 },
  { header: 'IN Time', key: 'in_time_ist', width: 18 },
  { header: 'OUT Time', key: 'out_time_ist', width: 18 },
  { header: 'Status', key: 'status', width: 10 },
  { header: 'Orders (Ltrs)', key: 'orders_ltrs', width: 13 },
  { header: 'Collection (Rs)', key: 'collection_rupees', width: 15 },
  { header: 'Active/Tertiary', key: 'active_tertiary', width: 15 },
  { header: 'Remarks & Feedback', key: 'remarks_feedback', width: 30 }
];

function fmtIst(t) {
  if (!t) return '';
  return new Date(t + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// Builds an .xlsx buffer from a list of visit rows (each with staff_name, distributor_name joined in).
// `title` is used for the sheet name / header row.
async function buildVisitsExcelBuffer(visits, title) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shop Visit App';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet((title || 'Visits').substring(0, 31));
  sheet.columns = COLUMNS;

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F3E9' } };

  for (const v of visits) {
    sheet.addRow({
      distributor_name: v.distributor_name,
      staff_name: v.staff_name,
      shop_name: v.shop_name,
      shop_type: v.shop_type || '',
      outlet_status: v.outlet_status || '',
      segment: v.segment || '',
      contact_number: v.contact_number || '',
      location_text: v.location_text || '',
      in_time_ist: fmtIst(v.in_time),
      out_time_ist: v.out_time ? fmtIst(v.out_time) : '',
      status: v.out_time ? 'Completed' : 'Open',
      orders_ltrs: v.orders_ltrs ?? '',
      collection_rupees: v.collection_rupees ?? '',
      active_tertiary: v.active_tertiary || '',
      remarks_feedback: v.remarks_feedback || ''
    });
  }

  sheet.autoFilter = { from: 'A1', to: 'O1' };

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Distributor', key: 'distributor', width: 22 },
    { header: 'Total Visits', key: 'total', width: 14 },
    { header: 'Completed', key: 'completed', width: 12 },
    { header: 'Open', key: 'open', width: 10 },
    { header: 'Total Orders (Ltrs)', key: 'orders', width: 18 },
    { header: 'Total Collection (Rs)', key: 'collection', width: 20 }
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F3E9' } };

  const byDist = {};
  for (const v of visits) {
    const key = v.distributor_name;
    if (!byDist[key]) byDist[key] = { total: 0, completed: 0, open: 0, orders: 0, collection: 0 };
    byDist[key].total++;
    if (v.out_time) byDist[key].completed++; else byDist[key].open++;
    byDist[key].orders += Number(v.orders_ltrs) || 0;
    byDist[key].collection += Number(v.collection_rupees) || 0;
  }
  for (const [distributor, s] of Object.entries(byDist)) {
    summarySheet.addRow({ distributor, total: s.total, completed: s.completed, open: s.open, orders: s.orders, collection: s.collection });
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildVisitsExcelBuffer };
