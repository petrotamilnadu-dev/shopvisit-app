const whoami = document.getElementById('whoami');
const distFilter = document.getElementById('distFilter');
const staffFilter = document.getElementById('staffFilter');
const tbody = document.querySelector('#visitTable tbody');
const emptyState = document.getElementById('emptyState');
const statsDiv = document.getElementById('stats');
const openVisitsList = document.getElementById('openVisitsList');
let currentRole = null;
let latestVisits = [];

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function fmtDT(t) {
  return t ? new Date(t + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
}
function fmtTime(t) {
  return t ? new Date(t + 'Z').toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
}
function fmtDuration(inTime, outTime) {
  if (!inTime) return '-';
  const start = new Date(inTime + 'Z').getTime();
  const end = outTime ? new Date(outTime + 'Z').getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return outTime ? label : `${label} <span class="small">(so far)</span>`;
}

async function init() {
  const meRes = await fetch('/api/auth/me');
  const me = await meRes.json();
  if (!me.user) { window.location.href = '/login.html'; return; }
  currentRole = me.user.role;
  whoami.textContent = `${me.user.username} (${me.user.role.toUpperCase()})`;

  const scopeRes = await fetch('/api/reports/scope');
  const scope = await scopeRes.json();
  distFilter.innerHTML = '<option value="">All</option>' +
    scope.distributors.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

  await loadStaffOptions();

  document.getElementById('fromDate').value = todayISO();
  document.getElementById('toDate').value = todayISO();

  loadOpenVisits();
  loadVisits();
  setInterval(() => { loadOpenVisits(); loadVisits(); }, 30000); // keep "live" data + open durations current
}

async function loadStaffOptions() {
  const distId = distFilter.value;
  const params = distId ? `?distributor_id=${distId}` : '';
  const res = await fetch('/api/reports/staff-list' + params);
  const staff = await res.json();
  const showDistName = !distId; // show "(Distributor)" only when viewing across multiple distributors
  staffFilter.innerHTML = '<option value="">All</option>' +
    staff.map(s => `<option value="${s.id}">${s.name}${showDistName ? ' (' + s.distributor_name + ')' : ''}</option>`).join('');
}

async function loadOpenVisits() {
  const res = await fetch('/api/reports/open-visits');
  let visits = await res.json();
  const staffId = staffFilter.value;
  if (staffId) visits = visits.filter(v => String(v.staff_id) === staffId);
  if (!visits.length) {
    openVisitsList.innerHTML = staffId
      ? '<p class="small">This staff member is not currently checked in to any shop.</p>'
      : '<p class="small">No staff currently checked in to a shop.</p>';
    return;
  }
  openVisitsList.innerHTML = visits.map(v => `
    <div class="list-item">
      <div>
        <b>${v.staff_name}</b> <span class="small">(${v.distributor_name})</span><br>
        <span class="small">${v.shop_name} — IN at ${fmtTime(v.in_time)}${v.location_text ? ' • ' + v.location_text : ''}</span>
      </div>
      <span class="badge off">Still IN</span>
    </div>
  `).join('');
}

async function loadVisits() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;
  const dist = distFilter.value;
  const staffId = staffFilter.value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (dist) params.set('distributor_id', dist);
  if (staffId) params.set('staff_id', staffId);

  const res = await fetch('/api/reports/visits?' + params.toString());
  const visits = await res.json();
  latestVisits = visits;

  const openCount = visits.filter(v => !v.out_time).length;
  statsDiv.innerHTML = `
    <div class="stat"><div class="num">${visits.length}</div><div class="label">Total Visits</div></div>
    <div class="stat"><div class="num">${visits.length - openCount}</div><div class="label">Completed</div></div>
    <div class="stat"><div class="num">${openCount}</div><div class="label">Still Open</div></div>
  `;

  if (!visits.length) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  const canEdit = currentRole === 'admin' || currentRole === 'tm';
  tbody.innerHTML = visits.map(v => `
    <tr>
      <td>${v.staff_name}</td>
      <td>${v.shop_name}</td>
      <td>${v.shop_type || '-'}</td>
      <td>${v.outlet_status || '-'}</td>
      <td>${v.segment || '-'}</td>
      <td>${v.contact_number || '-'}</td>
      <td>${v.location_text || '-'}${v.latitude ? ' <span class="small">(GPS)</span>' : ''}</td>
      <td>${fmtDuration(v.in_time, v.out_time)}</td>
      <td>${fmtDT(v.in_time)}</td>
      <td>${v.out_time ? fmtDT(v.out_time) : '<span class="badge off">Open</span>'}</td>
      <td>${v.orders_ltrs ?? '-'}</td>
      <td>${v.collection_rupees ?? '-'}</td>
      <td>${v.active_tertiary || '-'}</td>
      <td>${v.remarks_feedback || '-'}</td>
      <td>${v.photo_path ? `<a class="link" href="${v.photo_path}" target="_blank">View</a>` : '-'}</td>
      <td>${canEdit ? `<button type="button" class="secondary" onclick="openEditVisit(${v.id})">Edit</button>` : ''}</td>
    </tr>
  `).join('');
}

/* ---------- Edit visit (Admin / TM only) ---------- */
function openEditVisit(visitId) {
  const v = latestVisits.find(x => x.id === visitId);
  if (!v) return;
  document.getElementById('editVisitCard').dataset.visitId = visitId;
  document.getElementById('editShopType').value = v.shop_type || 'RETAILER';
  document.getElementById('editOutletStatus').value = v.outlet_status || 'NEW';
  document.getElementById('editShopName').value = v.shop_name || '';
  document.getElementById('editLocation').value = v.location_text || '';
  document.getElementById('editSegment').value = v.segment || 'CVL';
  document.getElementById('editContact').value = v.contact_number || '';
  document.getElementById('editOrders').value = v.orders_ltrs ?? '';
  document.getElementById('editCollection').value = v.collection_rupees ?? '';
  document.getElementById('editActiveTertiary').value = v.active_tertiary || '';
  document.getElementById('editRemarks').value = v.remarks_feedback || '';
  document.getElementById('editVisitCard').style.display = 'block';
  document.getElementById('editVisitCard').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  document.getElementById('editVisitCard').style.display = 'none';
});

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  const visitId = document.getElementById('editVisitCard').dataset.visitId;
  const body = {
    shop_type: document.getElementById('editShopType').value,
    outlet_status: document.getElementById('editOutletStatus').value,
    shop_name: document.getElementById('editShopName').value,
    location_text: document.getElementById('editLocation').value,
    segment: document.getElementById('editSegment').value,
    contact_number: document.getElementById('editContact').value,
    orders_ltrs: document.getElementById('editOrders').value,
    collection_rupees: document.getElementById('editCollection').value,
    active_tertiary: document.getElementById('editActiveTertiary').value,
    remarks_feedback: document.getElementById('editRemarks').value
  };
  const res = await fetch(`/api/reports/visits/${visitId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (res.ok) {
    document.getElementById('editVisitCard').style.display = 'none';
    loadVisits();
  } else {
    const data = await res.json();
    alert('Failed to save: ' + (data.error || 'Unknown error'));
  }
});

document.getElementById('refreshBtn').addEventListener('click', () => { loadOpenVisits(); loadVisits(); });
distFilter.addEventListener('change', async () => {
  staffFilter.value = ''; // reset staff choice when distributor changes
  await loadStaffOptions();
  loadOpenVisits();
  loadVisits();
});
staffFilter.addEventListener('change', () => { loadOpenVisits(); loadVisits(); });
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

init();
