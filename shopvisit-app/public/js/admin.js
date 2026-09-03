const msg = document.getElementById('msg');
function showMsg(text, type) {
  msg.innerHTML = `<div class="msg ${type}">${text}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const duration = (type === 'err' || text.length > 60) ? 12000 : 4000;
  setTimeout(() => { msg.innerHTML = ''; }, duration);
}

/* ---------- Auth check + tabs ---------- */
async function checkAuth() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (!data.user || data.user.role !== 'admin') { window.location.href = '/login.html'; return; }
  document.getElementById('whoami').textContent = `${data.user.username} (ADMIN)`;
}

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tabpane').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

/* ---------- Distributors ---------- */
async function loadDistributors() {
  const res = await fetch('/api/admin/distributors');
  const dists = await res.json();
  const list = document.getElementById('distList');
  list.innerHTML = '<h3 style="margin-top:0;">All Distributors</h3>' + (dists.length ? dists.map(d => `
    <div class="list-item">
      <div>
        <b>${d.name}</b> <span class="badge ${d.active ? 'on' : 'off'}">${d.active ? 'Active' : 'Inactive'}</span><br>
        <span class="small">${d.email}</span>
      </div>
      <div>
        <button class="secondary" onclick="toggleDist(${d.id}, ${d.active ? 0 : 1}, '${d.name.replace(/'/g, "\\'")}', '${d.email.replace(/'/g, "\\'")}')">${d.active ? 'Deactivate' : 'Activate'}</button>
        <button class="danger" onclick="deleteDist(${d.id})">Delete</button>
      </div>
    </div>
  `).join('') : '<p class="small">No distributors yet.</p>');

  // Also refresh dependent dropdowns
  populateSelect('staffDist', dists.filter(d => d.active));
  return dists;
}

async function toggleDist(id, active, name, email) {
  await fetch(`/api/admin/distributors/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, active })
  });
  loadDistributors(); loadTms();
}

async function deleteDist(id) {
  if (!confirm('Delete this distributor? This also removes their staff and TM assignments.')) return;
  await fetch(`/api/admin/distributors/${id}`, { method: 'DELETE' });
  loadDistributors(); loadTms(); loadStaff();
}

document.getElementById('addDistBtn').addEventListener('click', async () => {
  const name = document.getElementById('distName').value.trim();
  const email = document.getElementById('distEmail').value.trim();
  if (!name || !email) return showMsg('Name and email required', 'err');
  const res = await fetch('/api/admin/distributors', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  if (!res.ok) return showMsg('Failed to add distributor', 'err');
  document.getElementById('distName').value = '';
  document.getElementById('distEmail').value = '';
  showMsg('Distributor added', 'ok');
  loadDistributors(); loadTms();
});

/* ---------- TMs ---------- */
async function loadTms() {
  const [tmRes, distRes] = await Promise.all([
    fetch('/api/admin/tms'), fetch('/api/admin/distributors')
  ]);
  const tms = await tmRes.json();
  const dists = await distRes.json();
  const list = document.getElementById('tmList');
  list.innerHTML = '<h3 style="margin-top:0;">All Managers (TM)</h3>' + (tms.length ? tms.map(tm => `
    <div class="list-item" style="align-items:flex-start; flex-direction:column;">
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b>${tm.name}</b> <span class="badge ${tm.active ? 'on' : 'off'}">${tm.active ? 'Active' : 'Inactive'}</span><br>
          <span class="small">${tm.email}</span>
        </div>
        <div>
          <button class="danger" onclick="deleteTm(${tm.id})">Delete</button>
        </div>
      </div>
      <div style="margin-top:10px; width:100%;">
        <span class="small">Assigned Distributors:</span><br>
        ${dists.map(d => `
          <label style="display:inline-flex; align-items:center; gap:5px; font-weight:400; margin:4px 10px 4px 0;">
            <input type="checkbox" data-tm="${tm.id}" data-dist="${d.id}" ${tm.distributor_ids.includes(d.id) ? 'checked' : ''} onchange="updateTmAssignment(${tm.id})">
            ${d.name}
          </label>
        `).join('')}
      </div>
    </div>
  `).join('') : '<p class="small">No TMs yet.</p>');
}

async function updateTmAssignment(tmId) {
  const boxes = document.querySelectorAll(`input[data-tm="${tmId}"]`);
  const distributor_ids = Array.from(boxes).filter(b => b.checked).map(b => parseInt(b.dataset.dist));
  await fetch(`/api/admin/tms/${tmId}/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributor_ids })
  });
  showMsg('TM assignment updated', 'ok');
}

async function deleteTm(id) {
  if (!confirm('Delete this TM?')) return;
  await fetch(`/api/admin/tms/${id}`, { method: 'DELETE' });
  loadTms();
}

document.getElementById('addTmBtn').addEventListener('click', async () => {
  const name = document.getElementById('tmName').value.trim();
  const email = document.getElementById('tmEmail').value.trim();
  if (!name || !email) return showMsg('Name and email required', 'err');
  const res = await fetch('/api/admin/tms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  if (!res.ok) return showMsg('Failed to add TM', 'err');
  document.getElementById('tmName').value = '';
  document.getElementById('tmEmail').value = '';
  showMsg('TM added — now tick which Distributors they cover', 'ok');
  loadTms();
});

/* ---------- Staff ---------- */
function populateSelect(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

async function loadStaff() {
  const res = await fetch('/api/admin/staff');
  const staff = await res.json();
  const list = document.getElementById('staffList');
  list.innerHTML = '<h3 style="margin-top:0;">All Staff</h3>' + (staff.length ? staff.map(s => `
    <div class="list-item">
      <div>
        <b>${s.name}</b> <span class="badge ${s.active ? 'on' : 'off'}">${s.active ? 'Active' : 'Inactive'}</span><br>
        <span class="small">${s.distributor_name}${s.phone ? ' • ' + s.phone : ''} • PIN: <b>${s.pin_code}</b></span>
      </div>
      <div>
        <button class="secondary" onclick="resetStaffPin(${s.id})">Reset PIN</button>
        <button class="secondary" onclick="toggleStaff(${s.id}, ${s.active ? 0 : 1}, '${s.name.replace(/'/g, "\\'")}', '${(s.phone || '').replace(/'/g, "\\'")}', ${s.distributor_id})">${s.active ? 'Deactivate' : 'Activate'}</button>
        <button class="danger" onclick="deleteStaff(${s.id})">Delete</button>
      </div>
    </div>
  `).join('') : '<p class="small">No staff yet.</p>');
}

async function resetStaffPin(id) {
  if (!confirm('Reset PIN for this staff member? They will need the new PIN to log in.')) return;
  const res = await fetch(`/api/admin/staff/${id}/reset-pin`, { method: 'POST' });
  const data = await res.json();
  if (res.ok) { showMsg(`New PIN: ${data.pin_code}`, 'ok'); loadStaff(); }
  else showMsg('Failed to reset PIN', 'err');
}

async function toggleStaff(id, active, name, phone, distributor_id) {
  await fetch(`/api/admin/staff/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, distributor_id, active })
  });
  loadStaff();
}

async function deleteStaff(id) {
  if (!confirm('Delete this staff member?')) return;
  await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
  loadStaff();
}

document.getElementById('addStaffBtn').addEventListener('click', async () => {
  const name = document.getElementById('staffName').value.trim();
  const phone = document.getElementById('staffPhone').value.trim();
  const distributor_id = document.getElementById('staffDist').value;
  const pin_code = document.getElementById('staffPin').value.trim();
  if (!name || !distributor_id) return showMsg('Name and distributor required', 'err');
  const res = await fetch('/api/admin/staff', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, distributor_id, pin_code })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.error || 'Failed to add staff', 'err');
  document.getElementById('staffName').value = '';
  document.getElementById('staffPhone').value = '';
  document.getElementById('staffPin').value = '';
  showMsg(`Staff added — their login PIN is ${data.pin_code}`, 'ok');
  loadStaff();
});

/* ---------- Users (dashboard logins) ---------- */
async function refreshUserLinkOptions() {
  const role = document.getElementById('userRole').value;
  const wrap = document.getElementById('userLinkWrap');
  if (role === 'distributor') {
    const dists = await (await fetch('/api/admin/distributors')).json();
    wrap.innerHTML = `<label for="userLinkSelect">Distributor</label>
      <select id="userLinkSelect">${dists.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select>`;
  } else if (role === 'tm') {
    const tms = await (await fetch('/api/admin/tms')).json();
    wrap.innerHTML = `<label for="userLinkSelect">TM</label>
      <select id="userLinkSelect">${tms.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select>`;
  } else {
    // ASM sees every distributor — no link needed
    wrap.innerHTML = '<p class="small">ASM logins see all Distributors\' live data automatically — no assignment needed.</p>';
  }
}
document.getElementById('userRole').addEventListener('change', refreshUserLinkOptions);

async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
  const list = document.getElementById('userList');
  list.innerHTML = '<h3 style="margin-top:0;">Dashboard Logins</h3>' + (users.length ? users.map(u => `
    <div class="list-item">
      <div><b>${u.username}</b> <span class="small">(${u.role})</span></div>
      <div>
        ${u.role !== 'admin' ? `<button class="secondary" onclick="resetPw(${u.id})">Reset Password</button>
        <button class="danger" onclick="deleteUser(${u.id})">Delete</button>` : ''}
      </div>
    </div>
  `).join('') : '<p class="small">No logins created yet.</p>');
}

async function resetPw(id) {
  const newPassword = prompt('Enter new password for this login:');
  if (!newPassword) return;
  await fetch(`/api/admin/users/${id}/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  });
  showMsg('Password reset', 'ok');
}

async function deleteUser(id) {
  if (!confirm('Delete this login?')) return;
  await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  loadUsers();
}

document.getElementById('addUserBtn').addEventListener('click', async () => {
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value.trim();
  const role = document.getElementById('userRole').value;
  const linkId = document.getElementById('userLinkSelect')?.value;
  if (!username || !password) return showMsg('Fill all fields', 'err');
  if (role !== 'asm' && !linkId) return showMsg('Fill all fields', 'err');
  const body = { username, password, role };
  if (role === 'distributor') body.distributor_id = linkId;
  else if (role === 'tm') body.tm_id = linkId;
  const res = await fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.error || 'Failed to create login', 'err');
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  showMsg('Login created', 'ok');
  loadUsers();
});

/* ---------- Tools ---------- */
document.getElementById('testSummaryBtn').addEventListener('click', async () => {
  showMsg('Sending test summary...', 'ok');
  const res = await fetch('/api/admin/test-daily-summary', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) return showMsg('Failed: ' + data.error, 'err');
  showSummaryStats(data);
});

document.getElementById('testMorningReportBtn').addEventListener('click', async () => {
  showMsg('Generating and sending Excel report...', 'ok');
  const res = await fetch('/api/admin/test-morning-report', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) return showMsg('Failed: ' + data.error, 'err');
  showSummaryStats(data);
});

function showSummaryStats(data) {
  if (!data.smtpConfigured) {
    showMsg('⚠️ SMTP_USER / SMTP_PASS are not set in Render\'s Environment Variables — no emails can be sent until you add them.', 'err');
    return;
  }
  let text = `Sent: ${data.sent}, Skipped (nothing to send): ${data.skipped}`;
  if (data.errors && data.errors.length) {
    text += `<br>⚠️ Errors:<br>${data.errors.join('<br>')}`;
    showMsg(text, 'err');
  } else if (data.sent === 0) {
    showMsg(text + '<br>(No emails were sent — likely no visit data matched yet. Add a test visit entry and try again.)', 'ok');
  } else {
    showMsg(text, 'ok');
  }
}

document.getElementById('changePassBtn').addEventListener('click', async () => {
  const oldPassword = document.getElementById('oldPass').value;
  const newPassword = document.getElementById('newPass').value;
  const res = await fetch('/api/auth/change-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword })
  });
  const data = await res.json();
  if (res.ok) { showMsg('Password changed', 'ok'); document.getElementById('oldPass').value = ''; document.getElementById('newPass').value = ''; }
  else showMsg(data.error, 'err');
});

/* ---------- Backup / Restore ---------- */
document.getElementById('exportDataBtn').addEventListener('click', async () => {
  const res = await fetch('/api/admin/export-data');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shopvisit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showMsg('Backup file downloaded', 'ok');
});

document.getElementById('importDataBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Import this backup? This ADDS the backed-up Distributors/TMs/Staff to what you already have (it will not remove or overwrite anything currently in the system).')) {
    e.target.value = '';
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await fetch('/api/admin/import-data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Import failed');
    showMsg(`Imported: ${result.imported.distributors} distributors, ${result.imported.tms} TMs, ${result.imported.staff} staff, ${result.imported.users} logins. ${result.note}`, 'ok');
    loadDistributors(); loadTms(); loadStaff(); loadUsers();
  } catch (err) {
    showMsg('Import failed: ' + err.message, 'err');
  } finally {
    e.target.value = '';
  }
});

/* ---------- Storage ---------- */
async function loadStorageInfo() {
  const res = await fetch('/api/admin/storage-info');
  const data = await res.json();
  document.getElementById('storageInfo').textContent = `${data.fileCount} photos stored, using approximately ${data.totalMB} MB.`;
}

document.getElementById('cleanupBtn').addEventListener('click', async () => {
  const days = document.getElementById('cleanupDays').value || 90;
  if (!confirm(`Delete photo files for visits older than ${days} days? Visit data/history stays — only the photo image is removed.`)) return;
  const res = await fetch('/api/admin/cleanup-old-photos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderThanDays: days })
  });
  const data = await res.json();
  if (res.ok) { showMsg(`Cleared ${data.deleted} old photo(s)`, 'ok'); loadStorageInfo(); }
  else showMsg('Failed: ' + data.error, 'err');
});

/* ---------- Init ---------- */
(async function init() {
  await checkAuth();
  await loadDistributors();
  await loadTms();
  await loadStaff();
  await loadUsers();
  await refreshUserLinkOptions();
  await loadStorageInfo();
})();
