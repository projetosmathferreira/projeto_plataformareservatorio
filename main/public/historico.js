document.addEventListener('DOMContentLoaded', () => {
  // ==== token/login ====
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'index.html'; return; }

  // ==== elementos (com fallback se id não existir) ====
  const tbody = document.getElementById('tbody') || document.querySelector('tbody');
  const info  = document.getElementById('info')  || document.createElement('div');
  const cards = document.getElementById('cards') || null; // container mobile (se existir)

  let form  = document.getElementById('formFiltro') || document.querySelector('form');
  let fromI = document.getElementById('from');
  let toI   = document.getElementById('to');

  // se inputs não existirem pelos ids, tenta pegar os dois primeiros datetime-local
  if (!fromI || !toI) {
    const dts = Array.from(document.querySelectorAll('input[type="datetime-local"]'));
    fromI = fromI || dts[0] || null;
    toI   = toI   || dts[1] || null;
  }

  // params da URL
  const params = new URLSearchParams(location.search);
  const rid  = Number(params.get('rid') || 0);
  const nome = params.get('nome') || '';
  const vol  = Number(params.get('vol') || 0);

  // aceita #title ou #titulo
  const titleEl = document.getElementById('title') || document.getElementById('titulo');
  if (titleEl) titleEl.textContent = nome ? `Histórico — ${nome}` : 'Histórico';

  if (!rid) {
    if (info) info.textContent = 'Reservatório inválido.';
    return;
  }

  // helper p/ "YYYY-MM-DDTHH:mm" local (sem TZ)
  function toLocalNaive(dt) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  async function carregar({ from = null, to = null } = {}) {
    if (tbody) tbody.innerHTML = '';
    if (cards) cards.innerHTML = '';
    if (info) info.textContent = 'Carregando...';

    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to', to);

    const url = `/reservatorios/${rid}/registros${q.toString() ? `?${q.toString()}` : ''}`;

    let res;
    try {
      res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    } catch {
      if (info) info.textContent = 'Erro de rede ao buscar registros.';
      return;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (info) info.textContent = `Erro ${res.status} ${txt}`;
      return;
    }

    const j = await res.json();
    const regs = j.registros || [];

    if (info) info.textContent = regs.length ? `${regs.length} registro(s)` : 'Sem registros no período.';

    for (const r of regs) {
      // ===== Linha da TABELA (desktop) =====
      if (tbody) {
        const tr = document.createElement('tr');

        const dt = new Date(r.recorded_at);
        const data = dt.toLocaleDateString('pt-BR');
        const hora = dt.toLocaleTimeString('pt-BR', { hour12: false }); // HH:MM:SS

        const nivel  = Number(r.nivel_percent) || 0;
        const litros = Math.round(nivel * vol / 100);
        const temp   = Number(r.temperatura_c);

        tr.innerHTML = `
          <td class="border p-2">${data} ${hora}</td>
          <td class="border p-2 text-right">${nivel.toFixed(1)}%</td>
          <td class="border p-2 text-right">${litros.toLocaleString()} L</td>
          <td class="border p-2 text-right">${isFinite(temp) ? temp.toFixed(1) : '--'} °C</td>
          <td class="border p-2 text-right">${r.ph}</td>
        `;
        tbody.appendChild(tr);
      }

      // ===== Card MOBILE (sem scroll lateral) =====
      if (cards) {
        const dt = new Date(r.recorded_at);
        const data = dt.toLocaleDateString('pt-BR');
        const hora = dt.toLocaleTimeString('pt-BR', { hour12: false }); // HH:MM:SS
        const nivel  = Number(r.nivel_percent) || 0;
        const litros = Math.round(nivel * vol / 100);
        const temp   = Number(r.temperatura_c);

        const card = document.createElement('div');
        card.className = "border rounded p-3 bg-white shadow-sm";
        card.innerHTML = `
          <div class="text-xs text-gray-500 mb-2">${data} ${hora}</div>
          <div class="grid grid-cols-2 gap-8 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-gray-600">Nível</span>
              <span class="font-semibold">${nivel.toFixed(1)}%</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600">Litros</span>
              <span class="font-semibold">${litros.toLocaleString()} L</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600">Temp.</span>
              <span class="font-semibold">${isFinite(temp) ? temp.toFixed(1) : '--'} °C</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600">pH</span>
              <span class="font-semibold">${r.ph}</span>
            </div>
          </div>
        `;
        cards.appendChild(card);
      }
    }
  }

  // submit do filtro (se houver formulário)
  if (form && (fromI || toI)) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = fromI ? (fromI.value.trim() || null) : null;
      const t = toI   ? (toI.value.trim()   || null) : null;
      carregar({ from: f, to: t });
    });
  }

  // Inicialização:
  // 1) se houver inputs, podemos preencher com últimas 24h (comente se não quiser)
  if (fromI && toI) {
    const now = new Date();
    const before = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    fromI.value = toLocalNaive(before);
    toI.value   = toLocalNaive(now);
    carregar({ from: fromI.value, to: toI.value });
  } else {
    // 2) sem inputs? mostra os 10 últimos (backend já aplica o limite)
    carregar();
  }
});
