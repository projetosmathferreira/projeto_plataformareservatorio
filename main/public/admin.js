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
const msg        = $('msg');

const tbodyClientes = $('tbodyClientes');
const tbodyReserv   = $('tbodyReserv');

const filtroQ   = $('filtroQ');
const filtroCid = $('filtroClienteId');
const btnBuscar = $('btnBuscar');

// ===== criar cliente =====
$('fCliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome  = $('cNome').value.trim();
  const email = $('cEmail').value.trim();
  const senha = $('cSenha').value.trim();
  if (!nome || !email || !senha) {
    outCliente.textContent = 'Preencha nome, email e senha.';
    return;
  }
  try {
    const r = await api('/admin/clientes', {
      method: 'POST',
      body: JSON.stringify({ nome, email, senha }),
    });
    outCliente.textContent = JSON.stringify(r, null, 2);
    e.target.reset();
    buscar();
  } catch (er) {
    outCliente.textContent = er.message;
  }
});

// ===== criar reservatório =====
$('fReserv').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cliente_id = parseInt($('rCid').value, 10);
  const nome       = $('rNome').value.trim();
  const volume_l   = parseInt($('rVol').value, 10);
  if (!cliente_id || !nome || !volume_l) {
    outReserv.textContent = 'Preencha cliente_id, nome e volume.';
    return;
  }
  try {
    const r = await api('/admin/reservatorios', {
      method: 'POST',
      body: JSON.stringify({ cliente_id, nome, volume_l }),
    });
    outReserv.textContent = JSON.stringify(r, null, 2);
    e.target.reset();
    buscar();
  } catch (er) {
    outReserv.textContent = er.message;
  }
});

// ===== deletes =====
async function delCliente(id) {
  if (!confirm(`Excluir cliente ${id}? Isto removerá também reservatórios/registros (FK).`)) return;
  try {
    await api('/admin/clientes/' + id, { method: 'DELETE' });
    buscar();
  } catch (e) {
    alert(e.message);
  }
}

async function delReserv(id) {
  if (!confirm(`Excluir reservatório ${id}?`)) return;
  try {
    await api('/admin/reservatorios/' + id, { method: 'DELETE' });
    buscar();
  } catch (e) {
    alert(e.message);
  }
}

// ===== helpers para edição inline =====
function minimalInput(value, type = 'text', extraClass = '') {
  const el = document.createElement('input');
  el.type = type;
  el.value = value ?? '';
  el.className = `w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring focus:ring-blue-200 ${extraClass}`;
  return el;
}
function setRowBusy(tr, on) {
  tr.style.opacity = on ? '0.6' : '1';
  tr.querySelectorAll('button').forEach(b => b.disabled = !!on);
}

// ===== overview + filtros =====
btnBuscar.addEventListener('click', (e) => {
  e.preventDefault();
  buscar();
});

// === render com Editar/Salvar (CLIENTES) — agora com db_role editável ===
function renderClientes(list = []) {
  tbodyClientes.innerHTML = '';
  for (const c of list) {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;

    tr.innerHTML = `
      <td class="border p-2">${c.id}</td>
      <td class="border p-2" data-k="nome">${c.nome}</td>
      <td class="border p-2" data-k="email">${c.email}</td>
      <td class="border p-2" data-k="db_role">${c.db_role}</td>
      <td class="border p-2">${new Date(c.created_at).toLocaleString()}</td>
      <td class="border p-2 text-center space-x-1">
        <button class="px-2 py-1 text-white bg-amber-600 hover:bg-amber-500 rounded text-xs" data-action="edit">Editar</button>
        <button class="px-2 py-1 text-white bg-red-600 hover:bg-red-500 rounded text-xs"   data-action="del">Excluir</button>
      </td>
    `;

    const btnEdit = tr.querySelector('[data-action="edit"]');
    const btnDel  = tr.querySelector('[data-action="del"]');

    btnDel.onclick = () => delCliente(c.id);

    btnEdit.onclick = async () => {
      const editing = tr.dataset.editing === '1';
      const nomeTd  = tr.querySelector('td[data-k="nome"]');
      const emailTd = tr.querySelector('td[data-k="email"]');
      const roleTd  = tr.querySelector('td[data-k="db_role"]');

      if (!editing) {
        // entrar em edição
        tr.dataset.editing = '1';
        btnEdit.textContent = 'Salvar';

        nomeTd._input  = minimalInput(nomeTd.textContent.trim(), 'text');
        emailTd._input = minimalInput(emailTd.textContent.trim(), 'email');
        roleTd._input  = minimalInput(roleTd.textContent.trim(), 'text', 'uppercase');

        nomeTd.innerHTML = '';
        emailTd.innerHTML = '';
        roleTd.innerHTML = '';
        nomeTd.appendChild(nomeTd._input);
        emailTd.appendChild(emailTd._input);
        roleTd.appendChild(roleTd._input);
      } else {
        // salvar
        const id = parseInt(tr.dataset.id, 10);
        const payload = {
          nome:   (nomeTd._input?.value || '').trim(),
          email:  (emailTd._input?.value || '').trim(),
          db_role:(roleTd._input?.value || '').trim(),
        };
        // validações simples
        if (!payload.nome || !payload.email) {
          alert('Preencha nome e email válidos.');
          return;
        }
        if (!/^[A-Za-z0-9_]+$/.test(payload.db_role)) {
          alert('db_role deve conter apenas letras, números e underscore (_).');
          return;
        }

        setRowBusy(tr, true);
        try {
          await api('/admin/clientes/' + id, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          // volta para visual
          nomeTd.textContent  = payload.nome;
          emailTd.textContent = payload.email;
          roleTd.textContent  = payload.db_role;
          tr.dataset.editing = '0';
          btnEdit.textContent = 'Editar';
        } catch (e) {
          alert(e.message);
        } finally {
          setRowBusy(tr, false);
        }
      }
    };

    tbodyClientes.appendChild(tr);
  }
}

// === render com Editar/Salvar (RESERVATÓRIOS) ===
function renderReservatorios(list = []) {
  tbodyReserv.innerHTML = '';
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;

    tr.innerHTML = `
      <td class="border p-2">${r.id}</td>
      <td class="border p-2">${r.cliente_role}</td>
      <td class="border p-2" data-k="nome">${r.nome}</td>
      <td class="border p-2 text-right" data-k="volume_l">${r.volume_l}</td>
      <td class="border p-2">${new Date(r.created_at).toLocaleString()}</td>
      <td class="border p-2 text-center space-x-1">
        <button class="px-2 py-1 text-white bg-amber-600 hover:bg-amber-500 rounded text-xs" data-action="edit">Editar</button>
        <button class="px-2 py-1 text-white bg-red-600 hover:bg-red-500 rounded text-xs"   data-action="del">Excluir</button>
      </td>
    `;

    const btnEdit = tr.querySelector('[data-action="edit"]');
    const btnDel  = tr.querySelector('[data-action="del"]');

    btnDel.onclick = () => delReserv(r.id);

    btnEdit.onclick = async () => {
      const editing = tr.dataset.editing === '1';
      const nomeTd = tr.querySelector('td[data-k="nome"]');
      const volTd  = tr.querySelector('td[data-k="volume_l"]');

      if (!editing) {
        // entrar em edição
        tr.dataset.editing = '1';
        btnEdit.textContent = 'Salvar';

        nomeTd._input = minimalInput(nomeTd.textContent.trim(), 'text');
        volTd._input  = minimalInput(String(volTd.textContent.trim()), 'number', 'text-right');

        nomeTd.innerHTML = '';
        volTd.innerHTML  = '';
        nomeTd.appendChild(nomeTd._input);
        volTd.appendChild(volTd._input);
      } else {
        // salvar
        const id = parseInt(tr.dataset.id, 10);
        const payload = {
          nome: (nomeTd._input?.value || '').trim(),
          volume_l: parseInt(volTd._input?.value || '0', 10) || 0,
        };
        if (!payload.nome || !payload.volume_l) {
          alert('Preencha nome e volume válidos.');
          return;
        }

        setRowBusy(tr, true);
        try {
          await api('/admin/reservatorios/' + id, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          // volta para visual
          nomeTd.textContent = payload.nome;
          volTd.textContent  = payload.volume_l;
          tr.dataset.editing = '0';
          btnEdit.textContent = 'Editar';
        } catch (e) {
          alert(e.message);
        } finally {
          setRowBusy(tr, false);
        }
      }
    };

    tbodyReserv.appendChild(tr);
  }
}

async function buscar() {
  try {
    msg.textContent = 'Carregando...';
    const q   = (filtroQ.value || '').trim();
    const cid = parseInt(filtroCid.value || '0', 10) || '';
    const data = await api(`/admin/overview?q=${encodeURIComponent(q)}&cliente_id=${cid}`);
    renderClientes(data.clientes);
    renderReservatorios(data.reservatorios);
    msg.textContent = `${data.clientes.length} cliente(s), ${data.reservatorios.length} reservatório(s)`;
  } catch (e) {
    msg.textContent = e.message;
  }
}

// ==== start: só inicia se for admin ====
(async function start() {
  const ok = await isAdmin();
  if (!ok) {
    location.replace('dashboard.html');
    return;
  }
  buscar();
})();
