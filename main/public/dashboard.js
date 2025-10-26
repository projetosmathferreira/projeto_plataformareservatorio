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
            <!-- ID oculto (removido) -->
            <th class="border p-1">Nível (%)</th>
            <th class="border p-1">Litragem Atual (L)</th>
            <th class="border p-1">Temperatura (°C)</th>
            <th class="border p-1">pH</th>
            <th class="border p-1">Data / Hora</th>
          </tr>
        </thead>
        <tbody data-reservatorio-id="${r.id}" data-volume="${r.volume_l}"></tbody>
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

  // A API já devolve DESC, e usamos prepend nas linhas.
  // Para manter "mais recentes em cima", invertimos a lista antes de aplicar prepend.
  (j.registros || [])
    .slice()         // cópia
    .reverse()       // inverte para mais antigos primeiro
    .forEach(addLinha(tbody)); // prepend garante que o último (mais recente) fique no topo
}

// === ADICIONA UMA LINHA NA TABELA ===
function addLinha(tbody) {
  return (l) => {
    const vol = parseFloat(tbody.dataset.volume || '0') || 0;
    const litrosAtuais = (Number(l.nivel_percent) || 0) * vol / 100;
    const litrosFmt = Number.isFinite(litrosAtuais) ? litrosAtuais.toFixed(0) : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <!-- <td class="border p-1">${l.id}</td>  ID oculto -->
      <td class="border p-1">${Number(l.nivel_percent).toFixed(1)}</td>
      <td class="border p-1">${litrosFmt}</td>
      <td class="border p-1">${Number(l.temperatura_c).toFixed(1)}</td>
      <td class="border p-1">${l.ph}</td>
      <td class="border p-1">${new Date(l.recorded_at).toLocaleString()}</td>
    `;
    // usamos prepend para que a linha mais nova sempre apareça no topo
    tbody.prepend(tr);
  };
}

// === ATUALIZAÇÃO EM TEMPO REAL (SSE) ===
function iniciarStream() {
  const evt = new EventSource(`/stream?token=${token}`);
  evt.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const tbody = document.querySelector(`#table-${d.reservatorio_id} tbody`);
    if (tbody) addLinha(tbody)(d.registro); // novos sempre no topo
  };
  evt.onerror = () => console.warn('Conexão SSE perdida. Tentando reconectar...');
}

// === INICIAR ===
carregarReservatorios().then(iniciarStream);
