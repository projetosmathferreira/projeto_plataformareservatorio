// === VERIFICA LOGIN ===
const token = localStorage.getItem('token');
if (!token) window.location.href = 'index.html';

// === ELEMENTOS PRINCIPAIS ===
const conteudo = document.getElementById('conteudo');
document.getElementById('logout').onclick = () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
};

// === FUNÇÃO PRINCIPAL ===
async function carregarReservatorios() {
  // busca todos os reservatórios do cliente autenticado
  const res = await fetch('/reservatorios', { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  if (!data.reservatorios) return;

  // limpa conteúdo atual
  conteudo.innerHTML = '';

  // cria um bloco (tabela) para cada reservatório
  for (const r of data.reservatorios) {
    const bloco = document.createElement('section');
    bloco.className = 'bg-white rounded-lg shadow p-4 mb-6';
    bloco.innerHTML = `
      <h2 class="text-xl font-semibold mb-3">${r.nome} (${r.volume_l} L)</h2>
      <table id="table-${r.id}" class="w-full border text-sm">
        <thead class="bg-gray-200">
          <tr>
            <th class="border p-1">ID</th>
            <th class="border p-1">Nível (%)</th>
            <th class="border p-1">Temperatura (°C)</th>
            <th class="border p-1">pH</th>
            <th class="border p-1">Data / Hora</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    conteudo.appendChild(bloco);

    // carrega registros existentes daquele reservatório
    await carregarRegistros(r.id);
  }
}

// === CARREGAR TODOS OS REGISTROS EXISTENTES ===
async function carregarRegistros(reservatorioId) {
  const res = await fetch(`/reservatorios/${reservatorioId}/registros`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const j = await res.json();
  const tbody = document.querySelector(`#table-${reservatorioId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = ''; // limpa tabela
  (j.registros || []).forEach(addLinha(tbody)); // adiciona cada linha
}

// === ADICIONA UMA LINHA NA TABELA ===
function addLinha(tbody) {
  return (l) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border p-1">${l.id}</td>
      <td class="border p-1">${l.nivel_percent}</td>
      <td class="border p-1">${l.temperatura_c}</td>
      <td class="border p-1">${l.ph}</td>
      <td class="border p-1">${new Date(l.recorded_at).toLocaleString()}</td>
    `;
    tbody.prepend(tr); // insere no topo (mais recente primeiro)
  };
}

// === ATUALIZAÇÃO EM TEMPO REAL (SSE) ===
function iniciarStream() {
  const evt = new EventSource(`/stream?token=${token}`);
  evt.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const tbody = document.querySelector(`#table-${d.reservatorio_id} tbody`);
    if (tbody) addLinha(tbody)(d.registro);
  };
  evt.onerror = () => console.warn('Conexão SSE perdida. Tentando reconectar...');
}

// === INICIAR ===
carregarReservatorios().then(iniciarStream);
