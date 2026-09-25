// Kullanıcı yönetimi (yalnızca yönetici).
import { api } from '../api.js';
import { escapeHtml, fmtDate, relTime, badge, toast, openModal, spinner, emptyState } from '../ui.js';

const ROLE_OPTS = [
  { v: 'admin', l: 'Yönetici' },
  { v: 'reception', l: 'Resepsiyon' },
  { v: 'housekeeping', l: 'Kat Hizmetleri' },
  { v: 'accounting', l: 'Muhasebe' },
];
const ROLE_LABEL = Object.fromEntries(ROLE_OPTS.map((r) => [r.v, r.l]));

export async function render(container, ctx) {
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Kullanıcılar</h2><div class="sub">personel hesapları ve rol yetkileri</div></div>
      <button class="btn btn-gold" id="newUser">+ Yeni Kullanıcı</button>
    </div>
    <div class="card"><div id="userList">${spinner()}</div></div>`;

  const el = container.querySelector('#userList');
  async function refresh() {
    let list;
    try { list = await api.get('/api/users'); }
    catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }
    el.innerHTML = `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Kullanıcı</th><th>Ad Soyad</th><th>Rol</th><th>Durum</th><th>Son Giriş</th><th></th></tr></thead>
      <tbody>${list.map((u) => `<tr>
        <td class="t-code">${escapeHtml(u.username)}</td>
        <td class="t-strong">${escapeHtml(u.name)}</td>
        <td>${badge(ROLE_LABEL[u.role] || u.role, 'b-navy', false)}</td>
        <td>${u.active ? badge('Aktif', 'b-ok') : badge('Pasif', 'b-muted')}</td>
        <td class="muted">${u.lastLoginAt ? relTime(u.lastLoginAt) : 'hiç'}</td>
        <td class="t-right"><button class="btn btn-sm btn-ghost" data-edit="${u.id}">Düzenle</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openUserModal(list.find((x) => x.id === b.dataset.edit), refresh)));
  }

  container.querySelector('#newUser').addEventListener('click', () => openUserModal(null, refresh));
  await refresh();
}

function openUserModal(user, onDone) {
  const isEdit = !!user;
  const body = `
    ${isEdit ? '' : '<div class="field"><label>Kullanıcı Adı</label><input class="input" id="uUser" autocomplete="off"></div>'}
    <div class="field"><label>Ad Soyad</label><input class="input" id="uName" value="${isEdit ? escapeHtml(user.name) : ''}"></div>
    <div class="form-row">
      <div class="field"><label>Rol</label><select class="select" id="uRole">${ROLE_OPTS.map((r) => `<option value="${r.v}" ${isEdit && user.role === r.v ? 'selected' : ''}>${r.l}</option>`).join('')}</select></div>
      <div class="field"><label>Durum</label><select class="select" id="uActive"><option value="true" ${!isEdit || user.active ? 'selected' : ''}>Aktif</option><option value="false" ${isEdit && !user.active ? 'selected' : ''}>Pasif</option></select></div>
    </div>
    <div class="field"><label>Parola ${isEdit ? '<span class="hint">(boş=değişmez)</span>' : ''}</label><input class="input" type="password" id="uPass" autocomplete="new-password"></div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="saveUser">${isEdit ? 'Kaydet' : 'Oluştur'}</button>`;
  const m = openModal({ title: isEdit ? `Kullanıcı · ${user.username}` : 'Yeni Kullanıcı', body, footer: foot });
  foot.querySelector('#saveUser').addEventListener('click', async () => {
    const name = m.el.querySelector('#uName').value.trim();
    const role = m.el.querySelector('#uRole').value;
    const active = m.el.querySelector('#uActive').value === 'true';
    const password = m.el.querySelector('#uPass').value;
    try {
      if (isEdit) {
        await api.put(`/api/users/${user.id}`, { name, role, active, password: password || undefined });
        toast('Kullanıcı güncellendi.', 'ok');
      } else {
        const username = m.el.querySelector('#uUser').value.trim();
        if (!username || !name || !password) { toast('Kullanıcı adı, ad ve parola zorunlu.', 'err'); return; }
        await api.post('/api/users', { username, name, role, password });
        toast('Kullanıcı oluşturuldu.', 'ok');
      }
      m.close(); onDone();
    } catch (e) { toast(e.message, 'err'); }
  });
}
