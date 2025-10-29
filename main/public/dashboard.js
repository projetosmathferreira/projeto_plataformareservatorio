// ====== Login persistente / logout ======
const token = localStorage.getItem('token');
if (!token) window.location.href = 'index.html';

document.getElementById('logout').onclick = () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
};

const containers = document.getElementById('containers');
const vazio = document.getElementById('vazio');

// === Mostrar "Admin" apenas para contas com isAdmin (sem chamada extra) ===
function jwtPayload(tk){
  try{
    const p = tk.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(p));
  }catch{ return null; }
}
(async function revealAdminLink() {
  const el = document.getElementById('adminLink');
  if (!el) return;
  try {
    const r = await fetch('/admin/check', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    if (r.ok) el.classList.remove('hidden'); else el.remove();
  } catch { el.remove(); }
})();


// ====== LOADING OVERLAY (apenas visual) ======
function createLoadingOverlay() {
  const el = document.createElement('div');
  el.id = 'loading';
  el.className = 'absolute inset-0 hidden  backdrop-blur-[10px] flex items-center justify-center';
  el.innerHTML = `<div class="h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>`;
  document.body.appendChild(el);
  return el;
}
const loadingEl = createLoadingOverlay();
const showLoading = () => loadingEl && loadingEl.classList.remove('hidden');
const hideLoading = () => loadingEl && loadingEl.classList.add('hidden');

// ========== Canvas helpers (responsivo) ==========
function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: rect.width, H: rect.height };
}

// ====== Tanque ======
function drawTank(canvas, pct) {
  const { ctx, W, H } = prepareCanvas(canvas);

  const labelPad = 24;
  const gutter   = 16;
  const r        = Math.min(16, W * 0.08);
  const top      = 4;
  const bottom   = H - r / 2;
  const left     = gutter + labelPad;
  const right    = W - gutter;

  ctx.clearRect(0, 0, W, H);

  function tankWallsPath() {
    ctx.beginPath();
    ctx.moveTo(right, top - r);
    ctx.lineTo(right, bottom - r);
    ctx.quadraticCurveTo(right, bottom, right - r, bottom);
    ctx.lineTo(left + r, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - r);
    ctx.lineTo(left, top - r);
  }

  function tankClipPath() {
    ctx.beginPath();
    ctx.moveTo(left + r, top - r);
    ctx.lineTo(right - r, top - r);
    ctx.quadraticCurveTo(right, top, right, top);
    ctx.lineTo(right, bottom - r);
    ctx.quadraticCurveTo(right, bottom, right - r, bottom);
    ctx.lineTo(left + r, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - r);
    ctx.lineTo(left, top - r);
    ctx.quadraticCurveTo(left, top, left + r, top - r);
    ctx.closePath();
  }

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.8;
  tankWallsPath();
  ctx.stroke();

  const lvl = Math.max(0, Math.min(100, Number(pct) || 0));
  const fillTop = bottom - (lvl / 100) * (bottom - top);

  ctx.save();
  tankClipPath();
  ctx.clip();

  const grad = ctx.createLinearGradient(0, fillTop, 0, bottom);
  grad.addColorStop(0, "rgba(59,130,246,0.88)");
  grad.addColorStop(1, "rgba(59,130,246,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(left, fillTop, right - left, bottom - fillTop);

  const capH = Math.max(5, Math.min(12, (bottom - fillTop) * 0.07));
  ctx.beginPath();
  ctx.moveTo(left + 2, fillTop + capH);
  ctx.quadraticCurveTo((left + right) / 2, fillTop - capH, right - 2, fillTop + capH);
  ctx.lineTo(right - 2, fillTop);
  ctx.lineTo(left + 2, fillTop);
  ctx.closePath();
  ctx.fillStyle = "rgba(59,130,246,0.25)";
  ctx.fill();

  ctx.restore();

  tankWallsPath();
  ctx.stroke();

  const marks = [25, 50, 75, 100];
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  marks.forEach(p => {
    const y = bottom - (p / 100) * (bottom - top);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left + 1, y);
    ctx.lineTo(right - 1, y);
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${p}%`, left - 10, y);
  });

  ctx.fillStyle = "#111827";
  ctx.font = "bold 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lvl.toFixed(1) + "%", (left + right) / 2, (top + bottom) / 2);

  return lvl;
}

function animateTank(canvas, from, to, done) {
  const a = Math.max(0, Math.min(100, Number(from) || 0));
  const b = Math.max(0, Math.min(100, Number(to) || 0));
  const start = performance.now();
  const dur = 550;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const v = a + (b - a) * ease(t);
    drawTank(canvas, v);
    if (t < 1) canvas._raf = requestAnimationFrame(frame);
    else { canvas._raf = null; done && done(b); }
  }
  if (canvas._raf) cancelAnimationFrame(canvas._raf);
  canvas._raf = requestAnimationFrame(frame);
}

// ====== Card ======
function createReservatorioCard(r) {
  const section = document.createElement('section');
  section.className = 'bg-white rounded-lg shadow p-3 border border-gray-200';
  section.dataset.reservatorioId = r.id;

  section.innerHTML = `
    <div class="flex flex-wrap gap-2 justify-between items-center">
      <h2 class="text-base font-semibold text-gray-900">
        ${r.nome} <span class="text-xs text-gray-500">(${r.volume_l} L)</span>
      </h2>
      <div class="space-x-2 w-full md:w-auto">
        <button class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs" data-action="on">Ligar</button>
        <button class="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs" data-action="off">Desligar</button>
      </div>
    </div>
    <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
      <div class="rounded border bg-white p-2 pr-14 pl-14 md:pr-20 md:pl-20 flex items-center">
        <canvas id="tank-${r.id}" class="w-full h-44 md:h-56"></canvas>
      </div>
      <div class="md:col-span-2 flex flex-col gap-2">
        <div class="rounded border bg-gray-50 p-2">
          <div class="flex justify-between text-[12px] text-gray-600 mb-1">
            <span>Litragem atual / total</span>
            <span id="litrosTxt-${r.id}" class="font-medium text-gray-900">-- / ${r.volume_l} L</span>
          </div>
          <div class="w-full h-2 bg-gray-200 rounded overflow-hidden">
            <div id="litrosBar-${r.id}" class="h-2 bg-green-600" style="width:0%"></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded border bg-gray-50 p-2 text-center">
            <div class="text-[11px] text-gray-500">Temperatura</div>
            <div id="temp-${r.id}" class="text-lg font-semibold text-gray-800 mt-0.5">--.- °C</div>
          </div>
          <div class="rounded border bg-gray-50 p-2 text-center">
            <div class="text-[11px] text-gray-500">pH</div>
            <div id="ph-${r.id}" class="text-lg font-semibold text-gray-800 mt-0.5">--.-</div>
          </div>
        </div>
        <div class="rounded border bg-gray-50 p-2">
          <div class="text-[11px] mb-1 text-gray-600">Últimos registros</div>
          <ul id="list-${r.id}" class="text-[12px] max-h-24 space-y-0.5"></ul>
        </div>
        <div class="mt-1 flex justify-end">
          <a href="historico.html?rid=${r.id}&nome=${encodeURIComponent(r.nome)}&vol=${r.volume_l}" class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded shadow">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z"/></svg>
            Visualizar histórico
          </a>
        </div>
      </div>
    </div>
  `;
  section.querySelector('[data-action="on"]').onclick = () => alert('Ligar (placeholder)');
  section.querySelector('[data-action="off"]').onclick = () => alert('Desligar (placeholder)');
  containers.appendChild(section);
  return section;
}

// ====== SSE corrigido ======
function startSSE() {
  const API_BASE = window.API_BASE || '';
  let backoff = 1000;
  const maxBackoff = 15000;

  const connect = () => {
    const es = new EventSource(`${API_BASE}/stream?token=${token}`);

    es.onmessage = (ev) => {
      if (!ev.data || ev.data.startsWith(':')) return; // ignora ping
      let d;
      try { d = JSON.parse(ev.data); } catch { return; }

      const card = [...containers.children].find(el => Number(el.dataset.reservatorioId) === d.reservatorio_id);
      if (!card) return;

      const { listEl, tempEl, phEl, canvas, volume, litrosTxt, litrosBar } = card._refs;
      const { registro } = d;
      if (!registro) return;

      const pct = Number(registro.nivel_percent) || 0;
      const litrosAtuais = Math.round(pct * volume / 100);
      tempEl.textContent = `${Number(registro.temperatura_c).toFixed(1)} °C`;
      phEl.textContent = `${registro.ph}`;
      const li = document.createElement('li');
      li.textContent = `-> ${new Date(registro.recorded_at).toLocaleString()} • ${pct.toFixed(1)}% (${litrosAtuais} L) • ${Number(registro.temperatura_c).toFixed(1)}°C • pH ${registro.ph}`;
      listEl.prepend(li);
      while (listEl.children.length > 24) listEl.removeChild(listEl.lastChild);

      litrosTxt.innerHTML = `<span class="text-gray-900 font-semibold">${litrosAtuais} L</span> <span class="text-gray-500">/ ${volume} L</span>`;
      litrosBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      const from = Number(canvas._level ?? 0);
      animateTank(canvas, from, pct, v => canvas._level = v);
    };

    es.addEventListener('hello', () => { backoff = 1000; });
    es.onerror = () => {
      es.close();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
      console.warn('SSE desconectado; tentando reconectar…');
    };
  };
  connect();
}

// ====== Carga inicial ======
async function init() {
  showLoading();
  try {
    const res = await fetch('/reservatorios', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) {
      containers.innerHTML = `<div class="text-center text-sm text-red-600">Falha ao carregar reservatórios: ${res.status}</div>`;
      return;
    }
    const j = await res.json();
    containers.innerHTML = '';
    if (!j.reservatorios || !j.reservatorios.length) { vazio.classList.remove('hidden'); return; }
    vazio.classList.add('hidden');
    const cards = [];
    for (const r of j.reservatorios) {
      const card = createReservatorioCard(r);
      const listEl = card.querySelector(`#list-${r.id}`);
      const tempEl = card.querySelector(`#temp-${r.id}`);
      const phEl = card.querySelector(`#ph-${r.id}`);
      const canvas = card.querySelector(`#tank-${r.id}`);
      const litrosTxt = card.querySelector(`#litrosTxt-${r.id}`);
      const litrosBar = card.querySelector(`#litrosBar-${r.id}`);
      canvas._level = drawTank(canvas, 0);
      const r2 = await fetch(`/reservatorios/${r.id}/ultimos?limit=5`, { headers: { Authorization: 'Bearer ' + token } });
      if (r2.ok) {
        const j2 = await r2.json();
        const regs = j2.registros || [];
        regs.slice().reverse().forEach(reg => {
          const pct = Number(reg.nivel_percent) || 0;
          const litros = Math.round(pct * r.volume_l / 100);
          const li = document.createElement('li');
          li.textContent = `-> ${new Date(reg.recorded_at).toLocaleString()} • ${pct.toFixed(1)}% (${litros} L) • ${Number(reg.temperatura_c).toFixed(1)}°C • pH ${reg.ph}`;
          listEl.prepend(li);
        });
        if (regs.length) {
          const last = regs[0];
          const pct = Number(last.nivel_percent) || 0;
          const litros = Math.round(pct * r.volume_l / 100);
          tempEl.textContent = `${Number(last.temperatura_c).toFixed(1)} °C`;
          phEl.textContent = `${last.ph}`;
          litrosTxt.innerHTML = `<span class="text-gray-900 font-semibold">${litros} L</span> <span class="text-gray-500">/ ${r.volume_l} L</span>`;
          litrosBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
          animateTank(canvas, 0, pct, v => canvas._level = v);
        } else {
          litrosTxt.innerHTML = `<span class="text-gray-900 font-semibold">0 L</span> <span class="text-gray-500">/ ${r.volume_l} L</span>`;
          litrosBar.style.width = `0%`;
        }
      } else {
        const t = await r2.text();
        listEl.innerHTML = `<li class="text-red-600 text-[12px]">Falha ao carregar últimos: ${r2.status} ${t}</li>`;
      }
      card._refs = { listEl, tempEl, phEl, canvas, volume: r.volume_l, litrosTxt, litrosBar };
      cards.push(card);
    }
    window.addEventListener('resize', () => {
      for (const c of cards) drawTank(c._refs.canvas, Number(c._refs.canvas._level || 0));
    }, { passive: true });
    startSSE();
  } catch {
    containers.innerHTML = '<div class="text-center text-sm text-red-600">Falha ao carregar reservatórios (erro de rede).</div>';
  } finally {
    hideLoading();
  }
}

init();
