const whoami = document.getElementById('whoami');
const distFilter = document.getElementById('distFilter');
const tbody = document.querySelector('#visitTable tbody');
const emptyState = document.getElementById('emptyState');
const statsDiv = document.getElementById('stats');
const openVisitsList = document.getElementById('openVisitsList');

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function fmtDT(t) {
  return t ? new Date(t + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
}
function fmtTime(t) {
  return t ? new Date(t + 'Z').toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
}

async function init() {
  const meRes = await fetch('/api/auth/me');
  const me = await meRes.json();
  if (!me.user) { window.location.href = '/login.html'; return; }
  whoami.textContent = `${me.user.username} (${me.user.role.toUpperCase()})`;

  const scopeRes = await fetch('/api/reports/scope');
  const scope = await scopeRes.json();
  distFilter.innerHTML = '<option value="">All</option>' +
    scope.distributors.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

  document.getElementById('fromDate').value = todayISO();
  document.getElementById('toDate').value = todayISO();

  loadOpenVisits();
  loadVisits();
  setInterval(loadOpenVisits, 30000); // refresh "live" section every 30s
}

async function loadOpenVisits() {
  const res = await fetch('/api/reports/open-visits');
  const visits = await res.json();
  if (!visits.length) {
    openVisitsList.innerHTML = '<p class="small">No staff currently checked in to a shop.</p>';
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
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (dist) params.set('distributor_id', dist);

  const res = await fetch('/api/reports/visits?' + params.toString());
  const visits = await res.json();

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
  tbody.innerHTML = visits.map(v => `
    <tr>
      <td>${v.staff_name}</td>
      <td>${v.shop_name}</td>
      <td>${v.shop_type || '-'}</td>
      <td>${v.outlet_status || '-'}</td>
      <td>${v.segment || '-'}</td>
      <td>${v.contact_number || '-'}</td>
      <td>${v.location_text || '-'}${v.latitude ? ' <span class="small">(GPS)</span>' : ''}</td>
      <td>${fmtDT(v.in_time)}</td>
      <td>${v.out_time ? fmtDT(v.out_time) : '<span class="badge off">Open</span>'}</td>
      <td>${v.orders_ltrs ?? '-'}</td>
      <td>${v.collection_rupees ?? '-'}</td>
      <td>${v.active_tertiary || '-'}</td>
      <td>${v.remarks_feedback || '-'}</td>
      <td>${v.photo_path ? `<a class="link" href="${v.photo_path}" target="_blank">View</a>` : '-'}</td>
    </tr>
  `).join('');
}

document.getElementById('refreshBtn').addEventListener('click', () => { loadOpenVisits(); loadVisits(); });
distFilter.addEventListener('change', loadVisits);
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

init();
