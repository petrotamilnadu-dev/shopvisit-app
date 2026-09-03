const msg = document.getElementById('msg');
const staffLabel = document.getElementById('staffLabel');
const pinForm = document.getElementById('pinForm');
const shopPickerForm = document.getElementById('shopPickerForm');
const inForm = document.getElementById('inForm');
const outForm = document.getElementById('outForm');
const gpsStatus = document.getElementById('gpsStatus');

let currentStaff = null;   // { id, name, distributor_id, distributor_name }
let currentOpenVisit = null;
let capturedLat = null, capturedLng = null;

function showMsg(text, type) {
  msg.innerHTML = `<div class="msg ${type}">${text}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function clearMsg() { msg.innerHTML = ''; }

function showScreen(screen) {
  pinForm.style.display = screen === 'pin' ? 'block' : 'none';
  shopPickerForm.style.display = screen === 'picker' ? 'block' : 'none';
  inForm.style.display = screen === 'in' ? 'block' : 'none';
  outForm.style.display = screen === 'out' ? 'block' : 'none';
}

function resetToPin() {
  currentStaff = null;
  currentOpenVisit = null;
  capturedLat = null; capturedLng = null;
  gpsStatus.textContent = '';
  document.getElementById('pin').value = '';
  inForm.reset();
  outForm.reset();
  staffLabel.textContent = 'Enter your PIN to continue';
  clearMsg();
  showScreen('pin');
  document.getElementById('pin').focus();
}

function getGpsPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/* ---------- Screen 1: PIN verify ---------- */
pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('pin').value.trim();
  if (!/^\d{4}$/.test(pin)) return showMsg('Enter a valid 4-digit PIN', 'err');
  const submitBtn = pinForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'Checking...';

  try {
    const res = await fetch('/api/visits/verify-pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid PIN');
    currentStaff = data.staff;
    currentOpenVisit = data.openVisit;
    clearMsg();
    staffLabel.textContent = `${currentStaff.name} — ${currentStaff.distributor_name}`;

    if (currentOpenVisit) {
      document.getElementById('openShopName').textContent = currentOpenVisit.shop_name;
      showScreen('out');
      return;
    }

    // No open visit — check GPS for nearby shops already visited before, so staff
    // doesn't have to retype everything for a shop they've been to before.
    submitBtn.textContent = 'Checking location...';
    const pos = await getGpsPosition();
    if (pos) {
      capturedLat = pos.lat;
      capturedLng = pos.lng;
      const nearbyRes = await fetch(`/api/visits/nearby-shops?distributor_id=${currentStaff.distributor_id}&lat=${pos.lat}&lng=${pos.lng}&radius=100`);
      const nearby = nearbyRes.ok ? await nearbyRes.json() : [];
      if (nearby.length > 0) {
        renderNearbyShops(nearby);
        showScreen('picker');
        return;
      }
    }
    // No GPS or no nearby matches — go straight to the blank IN form
    showScreen('in');
  } catch (err) {
    showMsg('❌ ' + err.message, 'err');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'Continue';
  }
});

/* ---------- Screen 1.5: Nearby shop picker ---------- */
function renderNearbyShops(shops) {
  const list = document.getElementById('nearbyShopsList');
  list.innerHTML = shops.map((s, i) => `
    <button type="button" class="block secondary" style="margin-bottom:8px; text-align:left;" data-idx="${i}">
      <b>${s.shop_name}</b><br>
      <span class="small">${s.location_text || ''} — about ${s.distance_m}m away</span>
    </button>
  `).join('');
  list.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const shop = shops[Number(btn.dataset.idx)];
      prefillInForm(shop);
      showScreen('in');
    });
  });
}

function prefillInForm(shop) {
  inForm.reset();
  if (shop.shop_type) {
    const el = inForm.querySelector(`input[name="shop_type"][value="${shop.shop_type}"]`);
    if (el) el.checked = true;
  }
  // A shop found from a past visit is by definition an existing outlet
  const existingEl = inForm.querySelector('input[name="outlet_status"][value="Existing"]');
  if (existingEl) existingEl.checked = true;
  document.getElementById('shopName').value = shop.shop_name || '';
  document.getElementById('location').value = shop.location_text || '';
  if (shop.segment) {
    const segEl = inForm.querySelector(`input[name="segment"][value="${shop.segment}"]`);
    if (segEl) segEl.checked = true;
  }
  document.getElementById('contactNumber').value = shop.contact_number || '';
  gpsStatus.textContent = '✅ Location already captured for this shop.';
}

document.getElementById('newShopBtn').addEventListener('click', () => {
  inForm.reset();
  gpsStatus.textContent = capturedLat ? '✅ Location already captured.' : '';
  showScreen('in');
});
document.getElementById('changePinBtn0').addEventListener('click', resetToPin);

/* ---------- Force Shop Name / Location to uppercase as staff types ---------- */
['shopName', 'location'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    el.setSelectionRange(pos, pos);
  });
});

/* ---------- Compress photo before upload (keeps storage usage low on free hosting) ---------- */
function compressImage(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg', quality
      );
    };
    img.onerror = () => resolve(file); // fall back to original if anything goes wrong
    reader.readAsDataURL(file);
  });
}

/* ---------- GPS re-capture when photo is taken (keeps location fresh/accurate) ---------- */
document.getElementById('photo').addEventListener('change', () => {
  if (!navigator.geolocation) {
    gpsStatus.textContent = 'GPS not supported on this device — location will not be recorded.';
    return;
  }
  gpsStatus.textContent = 'Capturing GPS location...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      capturedLat = pos.coords.latitude;
      capturedLng = pos.coords.longitude;
      gpsStatus.textContent = `✅ Location captured: ${capturedLat.toFixed(5)}, ${capturedLng.toFixed(5)}`;
    },
    (err) => { gpsStatus.textContent = '⚠️ Could not capture GPS: ' + err.message; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

/* ---------- Screen 2: Check IN ---------- */
inForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('checkinBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  const formData = new FormData();
  formData.append('staff_id', currentStaff.id);
  formData.append('shop_type', inForm.querySelector('input[name="shop_type"]:checked')?.value || '');
  formData.append('outlet_status', inForm.querySelector('input[name="outlet_status"]:checked')?.value || '');
  formData.append('shop_name', document.getElementById('shopName').value);
  formData.append('location_text', document.getElementById('location').value);
  formData.append('segment', inForm.querySelector('input[name="segment"]:checked')?.value || '');
  formData.append('contact_number', document.getElementById('contactNumber').value);
  if (capturedLat) formData.append('latitude', capturedLat);
  if (capturedLng) formData.append('longitude', capturedLng);
  const photoFile = document.getElementById('photo').files[0];
  if (photoFile) {
    btn.textContent = 'Compressing photo...';
    const compressed = await compressImage(photoFile);
    formData.append('photo', compressed);
  }

  try {
    const res = await fetch('/api/visits/checkin', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Check-in failed');
    showMsg('✅ Checked IN successfully. Give OUT details once you finish at this shop.', 'ok');
    resetToPin();
  } catch (err) {
    showMsg('❌ ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Check IN to this Shop';
  }
});

/* ---------- Screen 3: Check OUT ---------- */
outForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  const body = {
    visit_id: currentOpenVisit.id,
    staff_id: currentStaff.id,
    orders_ltrs: document.getElementById('ordersLtrs').value,
    collection_rupees: document.getElementById('collectionRs').value,
    active_tertiary: document.getElementById('activeTertiary').value,
    remarks_feedback: document.getElementById('remarks').value
  };

  try {
    const res = await fetch('/api/visits/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Check-out failed');
    showMsg('✅ Checked OUT successfully. You can now check in to your next shop.', 'ok');
    resetToPin();
  } catch (err) {
    showMsg('❌ ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Check OUT of this Shop';
  }
});

document.getElementById('changePinBtn1').addEventListener('click', resetToPin);
document.getElementById('changePinBtn2').addEventListener('click', resetToPin);

showScreen('pin');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
