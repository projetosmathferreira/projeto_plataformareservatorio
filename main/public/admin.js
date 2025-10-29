// ==== auth / token ====
const token = localStorage.getItem('token');
if (!token) location.replace('index.html');

document.getElementById('logout').onclick = () => {
  localStorage.removeItem('token');
  location.replace('index.html');
};

// ==== helpers ====
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${res.status} ${t}`);
  }
  return res.json();
}

// ==== guarda de admin (rápida e sem gambiarra) ====
async function isAdmin() {
  try {
    const r = await fetch('/admin/check', {
      headers: { Authorization: 'Bearer ' + token },
    });
    return r.ok; // 200 => admin; 403 => não-admin
  } catch {
    return false;
  }
}

// ==== elementos ====
const outCliente = $('outCliente');
const outReserv  = $('outReserv');
const outRole    = $('outRole');
const msgCLIENT        = $('msgCLIENT');
const msgRESERV     = $('msgRESERV');
const msgROLES        = $('msgROLES');

// Tabelas
const tbodyClientes = $('tbodyClientes');
const tbodyReserv   = $('tbodyReserv');
const tbodyRoles    = $('tbodyRoles');

// Filtros independentes
const filtroQClientes   = $('filtroQClientes');
const btnBuscarClientes = $('btnBuscarClientes');

const filtroQReservs    = $('filtroQReservs');
const btnBuscarReservs  = $('btnBuscarReservs');

const filtroQRoles      = $('filtroQRoles');
const btnBuscarRoles    = $('btnBuscarRoles');

// ===== criar cliente (Role ID opcional) =====
$('fCliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome   = $('cNome').value.trim();
  const email  = $('cEmail').value.trim();
  const senha  = $('cSenha').value.trim();
  const roleId = parseInt(($('cRoleId').value || '').trim(), 10);

  if (!nome || !email || !senha) {
    outCliente.textContent = 'Preencha nome, email e senha.';
    return;
  }

  const payload = { nome, email, senha };
  if (Number.isInteger(roleId) && roleId > 0) payload.role_id = roleId;

  try {
    const r = await api('/admin/clientes', { method: 'POST', body: JSON.stringify(payload) });
    outCliente.textContent = JSON.stringify(r, null, 2);
    e.target.reset();
    buscarClientes();
  } catch (er) {
    outCliente.textContent = er.message;
  }
});

// ===== criar reservatório (exige Role ID) =====
$('fReserv').addEventListener('submit', async (e) => {
  e.preventDefault();
  const role_id  = parseInt(($('rRoleId').value || '').trim(), 10);
  const nome     = $('rNome').value.trim();
  const volume_l = parseInt(($('rVol').value || '').trim(), 10);

  if (!role_id || role_id <= 0 || !nome || !volume_l) {
    outReserv.textContent = 'Preencha role_id, nome e volume.';
    return;
  }

  try {
    const r = await api('/admin/reservatorios', { method: 'POST', body: JSON.stringify({ role_id, nome, volume_l }) });
    outReserv.textContent = JSON.stringify(r, null, 2);
    e.target.reset();
    buscarReservatorios();
  } catch (er) {
    outReserv.textContent = er.message;
  }
});

// ===== criar role =====
$('fRole').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('roleNome').value.trim();
  if (!nome) { outRole.textContent = 'Informe o nome do role.'; return; }
  try {
    const r = await api('/admin/roles', { method: 'POST', body: JSON.stringify({ nome }) });
    outRole.textContent = JSON.stringify(r, null, 2);
    e.target.reset();
    buscarRoles();
    
  } catch (er) {
    outRole.textContent = er.message;
  }
});

// ===== deletes =====
async function delCliente(id) {
  if (!confirm(`Excluir cliente ${id}? Isto removerá também reservatórios/registros (FK).`)) return;
  try { await api('/admin/clientes/' + id, { method: 'DELETE' }); buscarClientes();}
  catch (e) { alert(e.message); }
}
async function delReserv(id) {
  if (!confirm(`Excluir reservatório ${id}?`)) return;
  try { await api('/admin/reservatorios/' + id, { method: 'DELETE' }); buscarReservatorios();}
  catch (e) { alert(e.message); }
}
async function delRole(id) {
  if (!confirm(`Excluir role ${id}?`)) return;
  try { await api('/admin/roles/' + id, { method: 'DELETE' }); buscarRoles();}
  catch (e) { alert(e.message); }
}

// ===== edição inline util =====
function inputify(td, value, type='text', placeholder='') {
  const i = document.createElement('input');
  i.type = type;
  i.value = value ?? '';
  i.placeholder = placeholder || '';
  i.className = 'w-full border rounded px-2 py-1 text-sm';
  td.innerHTML = '';
  td.appendChild(i);
  return i;
}

// ===== renderização =====
function renderClientes(list = []) {
  tbodyClientes.innerHTML = '';
  for (const c of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border p-2">${c.id}</td>
      <td class="border p-2" data-k="nome">${c.nome}</td>
      <td class="border p-2" data-k="email">${c.email}</td>
       <td class="border p-2" data-k="role_id">${c.role_id}</td>
      <td class="border p-2">${new Date(c.created_at).toLocaleString()}</td>
      <td class="border p-2 text-center space-x-1">
        <button class="px-2 py-1 text-white bg-amber-600 hover:bg-amber-500 rounded text-xs" data-act="edit">Editar</button>
        <button class="px-2 py-1 text-white bg-red-600 hover:bg-red-500 rounded text-xs"   data-act="del">Excluir</button>
      </td>
    `;
    const btnEdit = tr.querySelector('[data-act="edit"]');
    const btnDel  = tr.querySelector('[data-act="del"]');

    let editing = false;
    let nomeI, emailI, roleIdI;

    btnEdit.onclick = async () => {
      if (!editing) {
        // entra em edição
        const tdNome  = tr.querySelector('td[data-k="nome"]');
        const tdEmail = tr.querySelector('td[data-k="email"]');
        const tdRole  = tr.querySelector('td[data-k="role_id"]');
        nomeI  = inputify(tdNome,  c.nome);
        emailI = inputify(tdEmail, c.email, 'email');
        // role: campo numérico (ID). Placeholder com nome atual se houver
        roleIdI = inputify(tdRole, c.role_id || '', 'number', c.role_name || 'role_id');
        btnEdit.textContent = 'Salvar';
        editing = true;
        return;
      }
      // salvar
      try {
        const payload = {};
        const nome  = nomeI.value.trim();
        const email = emailI.value.trim();
        const rid   = roleIdI.value.trim();
        if (nome && nome !== c.nome) payload.nome = nome;
        if (email && email !== c.email) payload.email = email;
        if (rid === '') payload.role_id = null;
        else if (/^\d+$/.test(rid)) payload.role_id = parseInt(rid, 10);

        if (Object.keys(payload).length) {
          await api('/admin/clientes/' + c.id, { method: 'PATCH', body: JSON.stringify(payload) });
        }
        await buscarClientes();
      } catch (e) {
        alert(e.message);
      }
    };

    btnDel.onclick = () => delCliente(c.id);
    tbodyClientes.appendChild(tr);
  }
}

function renderReservatorios(list = []) {
  tbodyReserv.innerHTML = '';
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border p-2">${r.id}</td>
      <td class="border p-2" data-k="role_id">${r.role_id}</td>
      <td class="border p-2" data-k="nome">${r.nome}</td>
      <td class="border p-2" data-k="volume_l">${r.volume_l}</td>
      <td class="border p-2">${new Date(r.created_at).toLocaleString()}</td>
      <td class="border p-2 text-center space-x-1">
        <button class="px-2 py-1 text-white bg-amber-600 hover:bg-amber-500 rounded text-xs" data-act="edit">Editar</button>
        <button class="px-2 py-1 text-white bg-red-600 hover:bg-red-500 rounded text-xs"   data-act="del">Excluir</button>
      </td>
    `;
    const btnEdit = tr.querySelector('[data-act="edit"]');
    const btnDel  = tr.querySelector('[data-act="del"]');

    let editing = false;
    let roleI, nomeI, volI;

    btnEdit.onclick = async () => {
      if (!editing) {
        roleI = inputify(tr.querySelector('td[data-k="role_id"]'), r.role_id || '', 'number', r.role_name || 'role_id');
        nomeI = inputify(tr.querySelector('td[data-k="nome"]'),    r.nome);
        volI  = inputify(tr.querySelector('td[data-k="volume_l"]'), r.volume_l, 'number');
        btnEdit.textContent = 'Salvar';
        editing = true;
        return;
      }
      try {
        const payload = {};
        const rid = roleI.value.trim();
        const nm  = nomeI.value.trim();
        const vl  = volI.value.trim();

        if (/^\d+$/.test(rid) && parseInt(rid,10) !== r.role_id) payload.role_id = parseInt(rid,10);
        if (nm && nm !== r.nome) payload.nome = nm;
        if (/^\d+$/.test(vl) && parseInt(vl,10) !== r.volume_l) payload.volume_l = parseInt(vl,10);

        if (Object.keys(payload).length) {
          await api('/admin/reservatorios/' + r.id, { method: 'PATCH', body: JSON.stringify(payload) });
        }
        
        await buscarReservatorios();

      } catch (e) {
        alert(e.message);
      }
    };

    btnDel.onclick = () => delReserv(r.id);
    tbodyReserv.appendChild(tr);
  }
}

function renderRoles(list = []) {
  tbodyRoles.innerHTML = '';
  for (const rr of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border p-2">${rr.id}</td>
      <td class="border p-2" data-k="nome">${rr.nome}</td>
      <td class="border p-2 text-center space-x-1">
        <button class="px-2 py-1 text-white bg-amber-600 hover:bg-amber-500 rounded text-xs" data-act="edit">Editar</button>
        <button class="px-2 py-1 text-white bg-red-600 hover:bg-red-500 rounded text-xs"   data-act="del">Excluir</button>
      </td>
    `;
    const btnEdit = tr.querySelector('[data-act="edit"]');
    const btnDel  = tr.querySelector('[data-act="del"]');

    let editing = false;
    let nomeI;

    btnEdit.onclick = async () => {
      if (!editing) {
        nomeI = inputify(tr.querySelector('td[data-k="nome"]'), rr.nome);
        btnEdit.textContent = 'Salvar';
        editing = true;
        return;
      }
      try {
        const nm = nomeI.value.trim();
        if (nm && nm !== rr.nome) {
          await api('/admin/roles/' + rr.id, { method: 'PATCH', body: JSON.stringify({ nome: nm }) });
        }
        await buscarClientes();
        await buscarReservatorios();
        await buscarRoles();
      } catch (e) {
        alert(e.message);
      }
    };

    btnDel.onclick = () => delRole(rr.id);
    tbodyRoles.appendChild(tr);
  }
}

// ===== buscas independentes =====
async function buscarClientes() {
  try {
    msgCLIENT.textContent = 'Carregando clientes...';
    const q = (filtroQClientes.value || '').trim();
    const data = await api(`/admin/overview?q=${encodeURIComponent(q)}&limit=200`);
    renderClientes(data.clientes || []);
    msgCLIENT.textContent = '';
  } catch (e) {
    msgCLIENT.textContent = e.message;
  }
}
async function buscarReservatorios() {
  try {
    msgRESERV.textContent = 'Carregando reservatórios...';
    const q = (filtroQReservs.value || '').trim();
    const data = await api(`/admin/overview?q=${encodeURIComponent(q)}&limit=200`);
    renderReservatorios(data.reservatorios || []);
    msgRESERV.textContent = '';
  } catch (e) {
    msgRESERV.textContent = e.message;
  }
}
async function buscarRoles() {
  try {
    msgROLES.textContent = 'Carregando roles...';
    const q = (filtroQRoles.value || '').trim();
    const data = await api(`/admin/overview?q=${encodeURIComponent(q)}&limit=200`);
    renderRoles(data.roles || []);
    msgROLES.textContent = '';
  } catch (e) {
    msgROLES.textContent = e.message;
  }
}



// eventos de filtro
btnBuscarClientes.addEventListener('click', (e) => { e.preventDefault(); buscarClientes(); });
btnBuscarReservs .addEventListener('click', (e) => { e.preventDefault(); buscarReservatorios(); });
btnBuscarRoles   .addEventListener('click', (e) => { e.preventDefault(); buscarRoles(); });

// ==== start: só inicia se for admin ====
(async function start() {
  const ok = await isAdmin();
  if (!ok) { location.replace('dashboard.html'); return; }
  await Promise.all([buscarClientes(), buscarReservatorios(), buscarRoles()]);
})();
