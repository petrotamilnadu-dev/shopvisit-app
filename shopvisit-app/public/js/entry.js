const msg = document.getElementById('msg');
const staffLabel = document.getElementById('staffLabel');
const pinForm = document.getElementById('pinForm');
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

/* ---------- Screen 1: PIN verify ---------- */
pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('pin').value.trim();
  if (!/^\d{4}$/.test(pin)) return showMsg('Enter a valid 4-digit PIN', 'err');
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
    } else {
      showScreen('in');
    }
  } catch (err) {
    showMsg('❌ ' + err.message, 'err');
  }
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

/* ---------- GPS auto-capture when photo is taken ---------- */
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
