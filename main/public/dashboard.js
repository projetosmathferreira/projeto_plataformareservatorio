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
  el.className = 'fixed inset-0 hidden  backdrop-blur-[10px] flex items-center justify-center';
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
function drawTank(canvas, pct, wavePhase = 0) {
  const { ctx, W, H } = prepareCanvas(canvas);

  const labelPad = 24;
  const gutter   = 16;
  const top      = 6;
  const bottom   = H - 6;
  const left     = gutter + labelPad;
  const right    = W - gutter;

  ctx.clearRect(0, 0, W, H);

  // ---------- Geometria do cilindro isométrico ----------
  const rx = Math.max(1, (right - left) / 2);
  const cx = (left + right) / 2;
  const ry = Math.max(7, Math.min(rx * 0.4, (bottom - top) * 0.22)); // achatamento da elipse (perspectiva)
  const topCY = top + ry;     // centro da elipse de cima
  const botCY = bottom - ry;  // centro da elipse de baixo

  // Caminho do "corpo" do tanque: elipse cheia no topo (informado) + paredes retas + arco frontal da elipse de baixo
  function bodyPath(topEllipseCY) {
    ctx.beginPath();
    ctx.ellipse(cx, topEllipseCY, rx, ry, 0, 0, Math.PI * 2);
    ctx.lineTo(cx + rx, botCY);
    ctx.ellipse(cx, botCY, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, topEllipseCY);
  }

  // Largura visível do casco numa altura y (considera a curvatura das elipses de topo/base)
  function halfWidthAt(y) {
    if (y >= topCY && y <= botCY) return rx;
    const refCy = y < topCY ? topCY : botCY;
    const dy = y - refCy;
    const ratio = 1 - (dy * dy) / (ry * ry);
    return ratio > 0 ? rx * Math.sqrt(ratio) : 0;
  }

  const lvl = Math.max(0, Math.min(100, Number(pct) || 0));
  // Mapeado sobre o corpo reto do cilindro (topCY -> botCY), não sobre a altura total do canvas,
  // já que as calotas elípticas (ry) já consomem parte dessa altura. Sem isso, o nível "gruda"
  // visualmente na borda de cima bem antes de chegar a 100%.
  const fillTop = botCY - (lvl / 100) * (botCY - topCY);
  const surfaceCY = Math.min(botCY, Math.max(topCY, fillTop)); // centro da elipse da superfície do líquido

  // ---------- Casco vazio (efeito "vidro/plástico") ----------
  const glassGrad = ctx.createLinearGradient(left, 0, right, 0);
  glassGrad.addColorStop(0,    "rgba(148,163,184,0.38)");
  glassGrad.addColorStop(0.15, "rgba(226,232,240,0.20)");
  glassGrad.addColorStop(0.5,  "rgba(248,250,252,0.10)");
  glassGrad.addColorStop(0.85, "rgba(226,232,240,0.20)");
  glassGrad.addColorStop(1,    "rgba(148,163,184,0.38)");
  bodyPath(topCY);
  ctx.fillStyle = glassGrad;
  ctx.fill();

  // ---------- Líquido ----------
  ctx.save();
  bodyPath(surfaceCY);
  ctx.clip();

  const liquidGradH = ctx.createLinearGradient(left, 0, right, 0);
  liquidGradH.addColorStop(0,    "rgba(29,78,216,0.92)");
  liquidGradH.addColorStop(0.18, "rgba(37,99,235,0.88)");
  liquidGradH.addColorStop(0.5,  "rgba(96,165,250,0.85)");
  liquidGradH.addColorStop(0.82, "rgba(37,99,235,0.88)");
  liquidGradH.addColorStop(1,    "rgba(29,78,216,0.92)");
  ctx.fillStyle = liquidGradH;
  ctx.fillRect(left, top, right - left, bottom - top);

  const depthGrad = ctx.createLinearGradient(0, surfaceCY, 0, botCY + ry);
  depthGrad.addColorStop(0, "rgba(255,255,255,0.08)");
  depthGrad.addColorStop(1, "rgba(15,23,42,0.18)");
  ctx.fillStyle = depthGrad;
  ctx.fillRect(left, top, right - left, bottom - top);

  // Superfície do líquido (disco) com ondulação e brilho
  ctx.beginPath();
  ctx.ellipse(cx, surfaceCY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(191,219,254,0.55)";
  ctx.fill();

  for (let i = 0; i < 2; i++) {
    const rippleRy = Math.max(1, ry * (0.55 - i * 0.18) + Math.sin(wavePhase * (1.4 + i * 0.6) + i) * 1.5);
    ctx.beginPath();
    ctx.ellipse(cx, surfaceCY, rx * (0.7 - i * 0.2), rippleRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${(0.22 - i * 0.08).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, surfaceCY - ry * 0.3, rx * 0.18, ry * 0.35, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  // Pequenas bolhas subindo dentro do líquido
  const liquidH = (botCY + ry) - surfaceCY;
  if (liquidH > 6) {
    if (!canvas._bubbles) {
      canvas._bubbles = Array.from({ length: 7 }, () => ({
        x: Math.random(),
        p: Math.random(),
        r: 1.2 + Math.random() * 2,
        speed: 0.0022 + Math.random() * 0.0035,
        wobble: Math.random() * Math.PI * 2,
      }));
    }
    canvas._bubbles.forEach(b => {
      b.p += b.speed;
      if (b.p > 1) {
        b.p = 0;
        b.x = Math.random();
        b.r = 1.2 + Math.random() * 2;
        b.speed = 0.0022 + Math.random() * 0.0035;
        b.wobble = Math.random() * Math.PI * 2;
      }
      const by = (botCY + ry) - b.p * liquidH;
      const bx = (cx - rx * 0.85) + b.x * (rx * 1.7) + Math.sin(wavePhase * 1.5 + b.wobble) * 3;
      const alpha = 0.5 * Math.sin(b.p * Math.PI);
      if (alpha <= 0) return;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, alpha + 0.25).toFixed(2)})`;
      ctx.fill();
    });
  }

  ctx.restore();

  // ---------- Brilho vertical do tubo (por cima de tudo, sutil) ----------
  ctx.save();
  bodyPath(topCY);
  ctx.clip();
  const hlGrad = ctx.createLinearGradient(left + rx * 0.15, 0, left + rx * 0.55, 0);
  hlGrad.addColorStop(0, "rgba(255,255,255,0)");
  hlGrad.addColorStop(0.5, "rgba(255,255,255,0.22)");
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hlGrad;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.restore();

  // ---------- Contorno do casco ----------
  // arco de trás (oculto) da elipse de baixo, pontilhado, para sugerir a profundidade
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = "rgba(17,24,39,0.35)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, botCY, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, topCY, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rx, topCY);
  ctx.lineTo(cx - rx, botCY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + rx, topCY);
  ctx.lineTo(cx + rx, botCY);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, botCY, rx, ry, 0, 0, Math.PI);
  ctx.stroke();

  // ---------- Marcações de nível ----------
  const marks = [25, 50, 75, 100];
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  marks.forEach(p => {
    const y = botCY - (p / 100) * (botCY - topCY);
    const hw = halfWidthAt(y);
    if (hw > 2) {
      // Arco frontal (visível), acompanhando a curvatura do cilindro
      ctx.strokeStyle = "rgba(229,231,235,0.9)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(cx, y, hw - 1, ry, 0, 0, Math.PI);
      ctx.stroke();

      // Arco traseiro (oculto), sugerido através do material translúcido
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "rgba(229,231,235,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, y, hw - 1, ry, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${p}%`, left - 10, y);
  });

  // ---------- Rótulo central do percentual ----------
  const label = lvl.toFixed(1) + "%";
  ctx.font = "bold 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const textY = (topCY + botCY) / 2;
  const metrics = ctx.measureText(label);
  const boxW = metrics.width + 12;
  const boxH = 18;
  const boxX = cx - boxW / 2;
  const boxY = textY - boxH / 2;
  const rad = 4;
  ctx.beginPath();
  ctx.moveTo(boxX + rad, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, rad);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, rad);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, rad);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, rad);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, textY);

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
    drawTank(canvas, v, canvas._wavePhase || 0);
    if (t < 1) canvas._raf = requestAnimationFrame(frame);
    else { canvas._raf = null; done && done(b); }
  }
  if (canvas._raf) cancelAnimationFrame(canvas._raf);
  canvas._raf = requestAnimationFrame(frame);
}

// ====== Loop contínuo da ondulação do tanque (efeito de líquido em repouso) ======
function startWaveLoop(canvas) {
  if (canvas._waveRaf) return;
  canvas._wavePhase = canvas._wavePhase || 0;
  function frame() {
    canvas._wavePhase += 0.045;
    if (!canvas._raf) { // evita redesenho duplicado durante a animação de nível
      drawTank(canvas, canvas._level || 0, canvas._wavePhase);
    }
    canvas._waveRaf = requestAnimationFrame(frame);
  }
  canvas._waveRaf = requestAnimationFrame(frame);
}

// ====== Turbidez ======
function classificarTurbidez(ntu) {
  const v = Number(ntu);
  if (!Number.isFinite(v)) return { label: '--', bg: 'bg-gray-400' };
  if (v <= 5)  return { label: 'Boa', bg: 'bg-emerald-600' };
  if (v <= 15) return { label: 'Média', bg: 'bg-amber-500' };
  return { label: 'Ruim', bg: 'bg-red-600' };
}

function updateTurbidez(refs, turbidez) {
  const { label, bg } = classificarTurbidez(turbidez);
  refs.turbidezBadge.textContent = label;
  refs.turbidezBadge.className = `px-2 py-0.5 rounded text-[10px] font-semibold text-white ${bg}`;
  refs.turbidezValor.textContent = Number.isFinite(Number(turbidez)) ? `${Number(turbidez).toFixed(1)} UNT` : '--.- UNT';
}

// ====== pH ======
function classificarPH(ph) {
  const v = Number(ph);
  if (!Number.isFinite(v)) return { label: '--', bg: 'bg-gray-400' };
  if (v < 6.5) return { label: 'Ácido', bg: 'bg-red-600' };
  if (v <= 7.5) return { label: 'Neutro', bg: 'bg-emerald-600' };
  return { label: 'Básico', bg: 'bg-blue-600' };
}

function updatePH(refs, ph) {
  const { label, bg } = classificarPH(ph);
  refs.phBadge.textContent = label;
  refs.phBadge.className = `px-2 py-0.5 rounded text-[10px] font-semibold text-white ${bg}`;
  refs.phEl.textContent = Number.isFinite(Number(ph)) ? `${Number(ph)}` : '--.-';
}

// ====== Estilos da animação da engrenagem (válvula) ======
(function injectValvulaStyles() {
  if (document.getElementById('valvula-anim-styles')) return;
  const style = document.createElement('style');
  style.id = 'valvula-anim-styles';
  style.textContent = `
    @keyframes valvula-girar-horario { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes valvula-girar-antihorario { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
    .valvula-engrenagem-horario, .valvula-engrenagem-antihorario { transform-origin: 50% 50%; }
    .valvula-engrenagem-horario { animation: valvula-girar-horario 3s linear infinite; }
    .valvula-engrenagem-antihorario { animation: valvula-girar-antihorario 3s linear infinite; }
  `;
  document.head.appendChild(style);
})();

// ====== Válvula ======
const VALVULA_ESTADOS = {
  parada:     { label: 'Parada',     badge: 'bg-gray-200 text-gray-600',   btnLabel: 'Ligar',    btnCls: 'bg-emerald-600 hover:bg-emerald-500', spinClass: null,                             iconColor: '#9ca3af' },
  enchendo:   { label: 'Enchendo',   badge: 'bg-blue-100 text-blue-700',   btnLabel: 'Desligar', btnCls: 'bg-gray-600 hover:bg-gray-500',       spinClass: 'valvula-engrenagem-horario',     iconColor: '#2563eb' },
  esvaziando: { label: 'Esvaziando', badge: 'bg-amber-100 text-amber-700', btnLabel: 'Desligar', btnCls: 'bg-gray-600 hover:bg-gray-500',       spinClass: 'valvula-engrenagem-antihorario', iconColor: '#d97706' },
};

function updateValvulaUI(refs, estado) {
  const cfg = VALVULA_ESTADOS[estado] || VALVULA_ESTADOS.parada;
  refs.valvulaStatus.textContent = cfg.label;
  refs.valvulaStatus.className = `text-sm font-semibold px-2 py-0.5 rounded inline-block ${cfg.badge}`;
  refs.valvulaBtn.textContent = cfg.btnLabel;
  refs.valvulaBtn.className = `px-6 py-3 text-white rounded text-xs shrink-0 ${cfg.btnCls}`;

  refs.valvulaIcon.classList.remove('valvula-engrenagem-horario', 'valvula-engrenagem-antihorario');
  if (cfg.spinClass) refs.valvulaIcon.classList.add(cfg.spinClass);
  refs.valvulaIcon.setAttribute('fill', cfg.iconColor);
  refs.valvulaIcon.setAttribute('stroke', cfg.iconColor);
  const path = refs.valvulaIcon.querySelector('path');
  if (path) path.style.fill = cfg.iconColor;
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
      
    </div>
    <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
      <div class="rounded border bg-white p-2 pr-16 pl-16 md:pr-24 md:pl-24 flex items-center">
        <canvas id="tank-${r.id}" class="w-full md:scale-[1.35] h-52 md:h-64"></canvas>
      </div>
      <div class="md:col-span-2 flex flex-col gap-2">
        <div class="rounded border bg-gray-50 p-2">
          <div class="flex justify-between text-[12px] text-gray-600 mb-1">
            <span>Litragem atual / total</span>
            <span id="litrosTxt-${r.id}" class="font-medium text-gray-900">-- / ${r.volume_l} L</span>
          </div>
          <div class="w-full h-4 bg-gray-200 rounded overflow-hidden transition-all linear">
            <div id="litrosBar-${r.id}" class="h-4 bg-green-600 transition-all linear" style="width:0%"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-2">
  <div class="rounded border bg-gray-50 p-2 flex items-center gap-2">
    <svg class="w-14 h-14 md:p-1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#888888"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <defs> <style>.cls-1{fill:none;stroke:#888888;stroke-miterlimit:10;stroke-width:1.91px;}</style> </defs> <g id="thermometer"> <circle class="cls-1" cx="6.27" cy="17.73" r="0.95"></circle> <line class="cls-1" x1="10.6" y1="13.4" x2="5.99" y2="18.01"></line> <line class="cls-1" x1="12.63" y1="11.37" x2="11.28" y2="12.72"></line> <path class="cls-1" d="M22.5,4.87a3.37,3.37,0,0,0-5.76-2.38L6.27,13a4.77,4.77,0,1,0,4.78,4.78L21.51,7.26A3.38,3.38,0,0,0,22.5,4.87Z"></path> <line class="cls-1" x1="14.86" y1="10.09" x2="16.77" y2="12"></line> <line class="cls-1" x1="16.77" y1="8.18" x2="18.68" y2="10.09"></line> <line class="cls-1" x1="18.68" y1="6.27" x2="20.59" y2="8.18"></line> </g> </g></svg>
  <div>
      <div class="text-[11px] text-gray-500">Temperatura</div>
      <div id="temp-${r.id}" class="text-lg font-semibold text-gray-800 mt-0.5">--.- °C</div>
    </div>
  </div>
  <div class="rounded border bg-gray-50 p-2 flex items-center gap-2">
    <svg  class="w-14 h-14 p-1" fill="#888888" height="200px" width="200px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" stroke="#888888"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <path d="M352.111,170.136V39.385h15.369c10.875,0,19.692-8.817,19.692-19.692C387.172,8.817,378.355,0,367.48,0 c-5.156,0-208.595,0-223.041,0c-10.875,0-19.692,8.817-19.692,19.692c0,10.875,8.817,19.692,19.692,19.692h15.369v130.763 C3.509,264.652,67.966,512,255.959,512C443.386,512,508.953,264.684,352.111,170.136z M224.373,380.763 c-4.155,10.711-16.207,16.026-26.917,11.871c-10.711-4.155-16.026-16.207-11.871-26.917c4.155-10.711,16.207-16.026,26.917-11.871 C223.213,358.001,228.528,370.052,224.373,380.763z M331.46,422.306c-8.063,20.785-31.45,31.098-52.235,23.035 c-20.785-8.063-31.098-31.45-23.035-52.235c8.063-20.785,31.45-31.098,52.235-23.035 C329.21,378.135,339.523,401.522,331.46,422.306z M273.088,297.3c-1.073-19.619-17.369-35.263-37.254-35.263H125.741 c10.735-21.793,29.644-45.501,62.911-62.961c6.48-3.402,10.541-10.117,10.541-17.437V39.385h113.533V181.64 c0,7.32,4.062,14.037,10.543,17.438c40.161,21.07,66.634,56.186,74.793,98.222H273.088z"></path> </g> </g> </g></svg>
  <div>
      <div class="text-[11px] text-gray-500">pH</div>
      <div class="flex items-center gap-1.5 mt-0.5">
        <span id="ph-${r.id}" class="text-lg font-semibold text-gray-800">--.-</span>
        <span id="phBadge-${r.id}" class="px-2 py-0.5 rounded text-[10px] font-semibold text-white bg-gray-400">--</span>
      </div>
    </div>
  </div>
</div>



        <div class="rounded border bg-gray-50 p-2">

        <div class="flex">
          <svg class="w-16 h-16 p-1 md:pr-2" viewBox="0 0 8.4666669 8.4666669" id="svg8" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:svg="http://www.w3.org/2000/svg" fill="#888888" stroke="#888888"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <defs id="defs2"></defs> <g id="layer1" transform="translate(0,-288.53332)"> <path d="M 5 1 A 1.0000999 1.0000999 0 0 0 4 2 L 4 4.9980469 L 28 4.9980469 L 28 2 A 1.0000999 1.0000999 0 0 0 27 1 L 5 1 z M 4 6.9980469 L 4 13 A 1.0000999 1.0000999 0 0 0 4.3671875 13.773438 L 12 20.019531 L 12 30 A 1.0000999 1.0000999 0 0 0 13.447266 30.894531 L 19.447266 27.894531 A 1.0000999 1.0000999 0 0 0 20 27 L 20 20.019531 L 27.632812 13.773438 A 1.0000999 1.0000999 0 0 0 28 13 L 28 6.9980469 L 4 6.9980469 z " id="rect919" style="color:#888888;font-style:normal;font-variant:normal;font-weight:normal;font-stretch:normal;font-size:medium;line-height:normal;font-family:sans-serif;font-variant-ligatures:normal;font-variant-position:normal;font-variant-caps:normal;font-variant-numeric:normal;font-variant-alternates:normal;font-feature-settings:normal;text-indent:0;text-align:start;text-decoration:none;text-decoration-line:none;text-decoration-style:solid;text-decoration-color:#888888;letter-spacing:normal;word-spacing:normal;text-transform:none;writing-mode:lr-tb;direction:ltr;text-orientation:mixed;dominant-baseline:auto;baseline-shift:baseline;text-anchor:start;white-space:normal;shape-padding:0;clip-rule:nonzero;display:inline;overflow:visible;visibility:visible;opacity:1;isolation:auto;mix-blend-mode:normal;color-interpolation:sRGB;color-interpolation-filters:linearRGB;solid-color:#888888;solid-opacity:1;vector-effect:none;fill:#888888;fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:1.99999988;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;paint-order:stroke fill markers;color-rendering:auto;image-rendering:auto;shape-rendering:auto;text-rendering:auto;enable-background:accumulate" transform="matrix(0.26458333,0,0,0.26458333,0,288.53332)"></path> </g> </g></svg>
        
        <div class="w-full">
          <div class="flex justify-between text-[12px] text-gray-600 mb-1">
            <span>Nível de Turbidez</span>
          </div>
          
        
            <div class="flex w-full items-center gap-2">
              <span id="turbidezValor-${r.id}" class="text-md font-semibold text-gray-800">--.- UNT</span>
              <span id="turbidezBadge-${r.id}" class="px-2 py-0.5 rounded text-[10px] font-semibold text-white bg-gray-400">--</span>
            </div>
        </div>
        </div> 
        </div>

        <div class="rounded border bg-gray-50 p-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <svg id="valvulaIcon-${r.id}" class="w-10 h-10 p-1"  viewBox="0 0 8.4666669 8.4666669" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:svg="http://www.w3.org/2000/svg" fill="#888888" stroke="#888888"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <defs id="defs2"></defs> <g id="layer1" transform="translate(0,-288.53332)"> <path d="m 14,1 c -0.43057,-2.2524e-4 -0.812955,0.2751544 -0.949219,0.6835938 l -1.015625,3.046875 c -0.410051,0.1443778 -0.81115,0.3099019 -1.203125,0.4980468 L 7.9589844,3.7929688 c -0.385025,-0.192405 -0.8499682,-0.1168812 -1.1542969,0.1875 l -2.828125,2.828125 c -0.3043812,0.3043287 -0.379905,0.7692719 -0.1875,1.1542968 l 1.4335937,2.8671874 c -0.1885794,0.39394 -0.3554568,0.796828 -0.5,1.208984 l -3.0429687,1.015626 c -0.4084391,0.136264 -0.68381856,0.518648 -0.68359375,0.949218 v 4 c -2.2524e-4,0.43057 0.27515435,0.812955 0.68359375,0.949219 l 3.0527344,1.017578 c 0.1438828,0.407584 0.3090971,0.805606 0.4960937,1.195313 l -1.4394531,2.878906 c -0.1924051,0.385025 -0.1168813,0.849968 0.1875,1.154297 l 2.828125,2.830078 c 0.3043287,0.304381 0.7692719,0.379905 1.1542969,0.1875 l 2.8730466,-1.4375 c 0.391573,0.187086 0.791637,0.352283 1.201172,0.496094 l 1.017578,3.050781 C 13.187045,30.734612 13.56943,31.009991 14,31.009766 h 4 c 0.43057,2.25e-4 0.812955,-0.275154 0.949219,-0.683594 l 1.017578,-3.056641 c 0.406496,-0.143244 0.804637,-0.308036 1.193359,-0.49414 l 2.88086,1.441406 c 0.385025,0.192405 0.849967,0.116881 1.154296,-0.1875 l 2.828126,-2.830078 c 0.304381,-0.304329 0.379905,-0.769272 0.1875,-1.154297 l -1.435547,-2.871094 c 0.188179,-0.392579 0.353616,-0.794395 0.498047,-1.205078 l 3.046874,-1.015625 c 0.40844,-0.136264 0.683819,-0.518649 0.683594,-0.949219 v -4 c 2.25e-4,-0.43057 -0.275155,-0.812954 -0.683594,-0.949218 L 27.271484,12.039062 C 27.127133,11.629665 26.96127,11.229223 26.773438,10.837891 l 1.4375,-2.8750004 c 0.192405,-0.3850249 0.116881,-0.8499681 -0.1875,-1.1542968 L 25.195312,3.9804688 C 24.890983,3.676088 24.426041,3.6005642 24.041016,3.7929688 l -2.865235,1.4316406 c -0.395249,-0.1889764 -0.799375,-0.3552819 -1.21289,-0.5 L 18.949219,1.6835938 C 18.812955,1.2751544 18.43057,0.99977476 18,1 Z m 1.996094,7.9980469 c 3.854148,0 7.005859,3.1516861 7.005859,7.0058591 0,3.854136 -3.151711,6.998047 -7.005859,6.998047 -3.854149,0 -6.9980471,-3.143911 -6.9980471,-6.998047 0,-3.854173 3.1438981,-7.0058591 6.9980471,-7.0058591 z" id="path940" style="color:#888888;font-style:normal;font-variant:normal;font-weight:normal;font-stretch:normal;font-size:medium;line-height:normal;font-family:sans-serif;font-variant-ligatures:normal;font-variant-position:normal;font-variant-caps:normal;font-variant-numeric:normal;font-variant-alternates:normal;font-feature-settings:normal;text-indent:0;text-align:start;text-decoration:none;text-decoration-line:none;text-decoration-style:solid;text-decoration-color:#888888;letter-spacing:normal;word-spacing:normal;text-transform:none;writing-mode:lr-tb;direction:ltr;text-orientation:mixed;dominant-baseline:auto;baseline-shift:baseline;text-anchor:start;white-space:normal;shape-padding:0;clip-rule:nonzero;display:inline;overflow:visible;visibility:visible;opacity:1;isolation:auto;mix-blend-mode:normal;color-interpolation:sRGB;color-interpolation-filters:linearRGB;solid-color:#888888;solid-opacity:1;vector-effect:none;fill:#888888;fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:1.99999988;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;paint-order:stroke fill markers;color-rendering:auto;image-rendering:auto;shape-rendering:auto;text-rendering:auto;enable-background:accumulate" transform="matrix(0.26458333,0,0,0.26458333,0,288.53332)"></path> </g> </g></svg>
            <div>
              <div class="text-[11px] text-gray-500">Controle da Válvula</div>
              <span id="valvulaStatus-${r.id}" class="text-sm font-semibold px-2 py-0.5 rounded inline-block bg-gray-100 text-gray-600">Parada</span>
            </div>
          </div>
          <button id="valvulaBtn-${r.id}" data-action="valvula" class="px-8 py-2 text-white rounded text-xs shrink-0 bg-emerald-600 hover:bg-emerald-500">Ligar</button>
        </div>
        
        <div class="rounded h-auto border bg-gray-50 p-2">
          <div class="text-[11px] mb-1 text-gray-600">Últimos registros</div>
          <ul id="list-${r.id}" class="text-[12px] h-auto space-y-0.5"></ul>
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

      const { listEl, tempEl, phEl, phBadge, canvas, volume, litrosTxt, litrosBar, turbidezBadge, turbidezValor } = card._refs;
      const { registro } = d;
      if (!registro) return;

      const pct = Number(registro.nivel_percent) || 0;
      const litrosAtuais = Math.round(pct * volume / 100);
      tempEl.textContent = `${Number(registro.temperatura_c).toFixed(1)} °C`;
      updatePH({ phEl, phBadge }, registro.ph);
      updateTurbidez({ turbidezBadge, turbidezValor }, registro.turbidez);
      const li = document.createElement('li');
      li.textContent = `-> ${new Date(registro.recorded_at).toLocaleString()} • ${pct.toFixed(1)}% (${litrosAtuais} L) • ${Number(registro.temperatura_c).toFixed(1)}°C • pH ${registro.ph} • Turb. ${registro.turbidez} UNT`;
      listEl.prepend(li);
      while (listEl.children.length > 5) listEl.removeChild(listEl.lastChild);

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
      const phBadge = card.querySelector(`#phBadge-${r.id}`);
      const canvas = card.querySelector(`#tank-${r.id}`);
      const litrosTxt = card.querySelector(`#litrosTxt-${r.id}`);
      const litrosBar = card.querySelector(`#litrosBar-${r.id}`);
      const turbidezBadge = card.querySelector(`#turbidezBadge-${r.id}`);
      const turbidezValor = card.querySelector(`#turbidezValor-${r.id}`);
      const valvulaStatus = card.querySelector(`#valvulaStatus-${r.id}`);
      const valvulaBtn = card.querySelector(`#valvulaBtn-${r.id}`);
      const valvulaIcon = card.querySelector(`#valvulaIcon-${r.id}`);
      canvas._level = drawTank(canvas, 0);
      startWaveLoop(canvas);

      let valvulaEstado = 'parada';
      updateValvulaUI({ valvulaStatus, valvulaBtn, valvulaIcon }, valvulaEstado);
      valvulaBtn.onclick = () => {
        valvulaEstado = valvulaEstado === 'parada' ? 'enchendo' : 'parada';
        updateValvulaUI({ valvulaStatus, valvulaBtn, valvulaIcon }, valvulaEstado);
        alert(valvulaEstado === 'enchendo' ? 'Válvula ligada (placeholder)' : 'Válvula desligada (placeholder)');
      };

      const r2 = await fetch(`/reservatorios/${r.id}/ultimos?limit=5`, { headers: { Authorization: 'Bearer ' + token } });
      if (r2.ok) {
        const j2 = await r2.json();
        const regs = j2.registros || [];
        regs.slice().reverse().forEach(reg => {
          const pct = Number(reg.nivel_percent) || 0;
          const litros = Math.round(pct * r.volume_l / 100);
          const li = document.createElement('li');
          li.textContent = `-> ${new Date(reg.recorded_at).toLocaleString()} • ${pct.toFixed(1)}% (${litros} L) • ${Number(reg.temperatura_c).toFixed(1)}°C • pH ${reg.ph} • Turb. ${reg.turbidez} UNT`;
          listEl.prepend(li);
        });

       
        while (listEl.children.length > 5) listEl.removeChild(listEl.lastChild);


        if (regs.length) {
          const last = regs[0];
          const pct = Number(last.nivel_percent) || 0;
          const litros = Math.round(pct * r.volume_l / 100);
          tempEl.textContent = `${Number(last.temperatura_c).toFixed(1)} °C`;
          updatePH({ phEl, phBadge }, last.ph);
          updateTurbidez({ turbidezBadge, turbidezValor }, last.turbidez);
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
      card._refs = { listEl, tempEl, phEl, phBadge, canvas, volume: r.volume_l, litrosTxt, litrosBar, turbidezBadge, turbidezValor, valvulaStatus, valvulaBtn, valvulaIcon };
      cards.push(card);
    }


    window.addEventListener('resize', () => {
      for (const c of cards) drawTank(c._refs.canvas, Number(c._refs.canvas._level || 0), c._refs.canvas._wavePhase || 0);
    }, { passive: true });
    startSSE();
  } catch {
    containers.innerHTML = '<div class="text-center text-sm text-red-600">Falha ao carregar reservatórios (erro de rede).</div>';
  } finally {
    hideLoading();
  }
}

init();