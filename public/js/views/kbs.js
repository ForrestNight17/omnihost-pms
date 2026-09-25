// KBS — Kimlik Bildirim Sistemi (EGM/Jandarma) bildirimleri.
import { api } from '../api.js';
import { escapeHtml, fmtDate, fmtDateShort, relTime, badge, toast, openModal, spinner, emptyState, initials } from '../ui.js';

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let inHouse, records;
  try { [inHouse, records] = await Promise.all([api.reservations({ status: 'checked_in' }), api.get('/api/kbs')]); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }

  const hasCheckin = (resId) => records.some((r) => r.reservationId === resId && r.type === 'checkin' && r.status === 'sent');
  const pending = inHouse.filter((r) => !hasCheckin(r.id));

  container.innerHTML = `
    <div class="page-head">
      <div><h2>KBS Kimlik Bildirim</h2><div class="sub">EGM / Jandarma konaklama bildirimi (yasal zorunluluk)</div></div>
    </div>

    <div class="card mb">
      <div class="card-head"><h3>Bekleyen Giriş Bildirimleri</h3><span class="card-sub">${pending.length} misafir</span></div>
      <div class="card-pad" id="pending">
        ${pending.length ? `<div class="mini-list">${pending.map((r) => `
          <div class="mini-row">
            <div class="mr-av">${initials(r.guestName)}</div>
            <div class="mr-main"><strong>${escapeHtml(r.guestName)}</strong><span>Oda ${r.roomNumber || '—'} · ${escapeHtml(r.nationality || 'TR')} · ${escapeHtml(r.code)}</span></div>
            <button class="btn btn-sm btn-gold" data-kbs="${r.id}">Giriş Bildir</button>
          </div>`).join('')}</div>` : emptyState('✓', 'Tüm girişler bildirildi.')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Bildirim Geçmişi</h3><span class="card-sub">${records.length} kayıt</span></div>
      <div class="card-pad">
        ${records.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Ad Soyad</th><th>İşlem</th><th>Kimlik</th><th>Uyruk</th><th>Durum</th><th>Referans</th><th>Zaman</th></tr></thead>
          <tbody>${records.map((k) => `<tr>
            <td class="t-strong">${escapeHtml(k.firstName)} ${escapeHtml(k.lastName)}</td>
            <td>${k.type === 'checkin' ? badge('Giriş', 'b-ok') : badge('Çıkış', 'b-navy')}</td>
            <td class="mono">${escapeHtml(k.idType === 'passport' ? 'Pasaport' : 'TC')} ${escapeHtml(maskId(k.idNumber))}</td>
            <td>${escapeHtml(k.nationality || '')}</td>
            <td>${k.status === 'sent' ? badge('Gönderildi', 'b-ok') : badge('Hata', 'b-danger')}</td>
            <td class="mono muted">${escapeHtml(k.reference || '—')}</td>
            <td class="muted">${relTime(k.createdAt)}</td>
          </tr>`).join('')}</tbody></table></div>` : emptyState('🪪', 'Henüz bildirim yok.')}
      </div>
    </div>`;

  container.querySelector('#pending').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kbs]'); if (!b) return;
    const r = await api.reservation(b.dataset.kbs);
    openKbsModal(ctx, r, 'checkin');
  });
}

function maskId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 4 ? s.slice(0, 3) + '•••' + s.slice(-2) : s;
}

export function openKbsModal(ctx, reservation, type) {
  const isTc = (reservation.nationality || 'TR') === 'TR';
  const body = `
    <p class="muted" style="margin-top:0"><b>${escapeHtml(reservation.guestName)}</b> — ${type === 'checkin' ? 'giriş' : 'çıkış'} kimlik bildirimi</p>
    <div class="form-row">
      <div class="field"><label>Kimlik Türü</label>
        <select class="select" id="kType"><option value="tc" ${isTc ? 'selected' : ''}>T.C. Kimlik</option><option value="passport" ${!isTc ? 'selected' : ''}>Pasaport</option></select>
      </div>
      <div class="field"><label>Kimlik / Pasaport No</label><input class="input" id="kNo" placeholder="${isTc ? '11 haneli TC no' : 'Pasaport no'}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Doğum Tarihi</label><input class="input" type="date" id="kBirth"></div>
      <div class="field"><label>Uyruk</label><input class="input" id="kNat" value="${escapeHtml(reservation.nationality || 'TR')}" maxlength="3"></div>
    </div>
    <p class="hint">Kimlik bilgileri misafir kartına kaydedilir ve KBS'ye iletilir.</p>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="sendKbs">KBS'ye Bildir</button>`;
  const m = openModal({ title: 'KBS Bildirimi', body, footer: foot });
  foot.querySelector('#sendKbs').addEventListener('click', async () => {
    const idNumber = m.el.querySelector('#kNo').value.trim();
    if (!idNumber) { toast('Kimlik/pasaport no girin.', 'err'); return; }
    try {
      const out = await api.post(`/api/kbs/${type}/${reservation.id}`, {
        idType: m.el.querySelector('#kType').value, idNumber,
        birthDate: m.el.querySelector('#kBirth').value,
      });
      toast(out.record.message || 'KBS bildirimi gönderildi.', 'ok');
      m.close(); ctx.reload();
    } catch (e) { toast(e.message, 'err'); }
  });
}
