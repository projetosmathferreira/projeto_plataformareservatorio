// main/platform_api.js
// npm i express pg bcrypt jsonwebtoken cors

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const APP_TZ = process.env.APP_TZ || "America/Sao_Paulo";

import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const { Pool, Client } = pkg;
const app = express();

app.use(express.json());
app.use(cors());

// servir /public
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "./public");
app.use(express.static(publicDir));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET  = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// ========= helpers =========
function adminOnly(req, res, next) {
  if (!req.user?.email || req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "apenas admin" });
  }
  next();
}

// ========= AUTH =========
app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: "email e senha obrigatórios" });

  try {
    const r = await pool.query(
      "SELECT id, email, password_hash FROM clientes WHERE email=$1",
      [email]
    );
    if (!r.rows.length) return res.status(401).json({ error: "usuário não encontrado" });
    const ok = await bcrypt.compare(senha, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "senha incorreta" });

    const isAdmin = r.rows[0].email === ADMIN_EMAIL;
    const token = jwt.sign({ id: r.rows[0].id, email: r.rows[0].email, isAdmin }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "no token" });
  try {
    req.user = jwt.verify(h.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "token inválido" });
  }
}

// útil para o front (opcional)
app.get("/auth/me", auth, async (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, isAdmin: req.user.email === ADMIN_EMAIL });
});

// ========= RESERVATÓRIOS (por role) =========
app.get("/reservatorios", auth, async (req, res) => {
  try {
    const q = await pool.query("SELECT role_id FROM clientes WHERE id=$1", [req.user.id]);
    const roleId = q.rows[0]?.role_id || null;

    if (!roleId) return res.json({ reservatorios: [] });

    const r = await pool.query(
      `SELECT id, nome, volume_l
       FROM reservatorios
       WHERE role_id = $1
       ORDER BY id`,
      [roleId]
    );
    res.json({ reservatorios: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// últimos N para dashboard
app.get("/reservatorios/:id/ultimos", auth, async (req, res) => {
  try {
    const rid = Number(req.params.id);
    const own = await pool.query(
      "SELECT 1 FROM reservatorios r JOIN clientes c ON c.role_id = r.role_id WHERE r.id=$1 AND c.id=$2",
      [rid, req.user.id]
    );
    if (!own.rowCount) return res.status(403).json({ error: "reservatório não autorizado" });

    const limitQ = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 200);
    const r = await pool.query(
      `SELECT id, reservatorio_id, nivel_percent, temperatura_c, ph, recorded_at
       FROM registros
       WHERE reservatorio_id=$1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [rid, limitQ]
    );
    res.json({ registros: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// histórico com período (inputs datetime-local em hora local)
app.get("/reservatorios/:id/registros", auth, async (req, res) => {
  try {
    const rid = Number(req.params.id) || 0;
    const own = await pool.query(
      "SELECT 1 FROM reservatorios r JOIN clientes c ON c.role_id = r.role_id WHERE r.id=$1 AND c.id=$2",
      [rid, req.user.id]
    );
    if (!own.rowCount) return res.status(403).json({ error: "reservatório não autorizado" });

    const from = (req.query.from || "").trim();
    const to   = (req.query.to   || "").trim();
    const haveRange = !!(from || to);
    const limitQ = haveRange
      ? Math.min(Math.max(parseInt(req.query.limit || "500", 10), 1), 2000)
      : 10;

    let sql = `
      SELECT id, reservatorio_id, nivel_percent, temperatura_c, ph, recorded_at
      FROM registros
      WHERE reservatorio_id = $1
    `;
    const params = [rid];
    let i = 2;

    if (from) {
      sql += ` AND recorded_at >= ($${i}::timestamp AT TIME ZONE $${i + 1})`;
      params.push(from, APP_TZ);
      i += 2;
    }
    if (to) {
      sql += ` AND recorded_at < ( ($${i}::timestamp AT TIME ZONE $${i + 1}) + INTERVAL '1 minute')`;
      params.push(to, APP_TZ);
      i += 2;
    }

    sql += ` ORDER BY recorded_at DESC LIMIT $${i}`;
    params.push(limitQ);

    const r = await pool.query(sql, params);
    res.json({ registros: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========= ADMIN =========

// ping de admin
app.get("/admin/check", auth, adminOnly, (_req, res) => {
  res.json({ ok: true });
});

// criar cliente (SEM criar role automaticamente) — role_id é opcional
app.post("/admin/clientes", auth, adminOnly, async (req, res) => {
  const { nome, email, senha, role_id } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ error: "nome, email, senha" });

  try {
    const hash = await bcrypt.hash(senha, 10);
    const r = await pool.query(
      `INSERT INTO clientes (nome, email, password_hash, role_id)
       VALUES ($1,$2,$3,$4)
       RETURNING id, nome, email, role_id`,
      [nome, email, hash, Number.isInteger(role_id) ? role_id : null]
    );
    res.json({ cliente: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// editar cliente (nome, email, role_id opcional / null reseta)
app.patch("/admin/clientes/:id", auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, email, role_id } = req.body || {};
  const sets = [];
  const params = [];
  let i = 1;

  if (typeof nome === 'string')  { sets.push(`nome=$${i++}`);  params.push(nome); }
  if (typeof email === 'string') { sets.push(`email=$${i++}`); params.push(email); }
  if (role_id === null)          { sets.push(`role_id=NULL`); }
  else if (Number.isInteger(role_id)) { sets.push(`role_id=$${i++}`); params.push(role_id); }

  if (!sets.length) return res.json({ ok: true, unchanged: true });

  params.push(id);
  try {
    const r = await pool.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id=$${i} RETURNING id`, params);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// excluir cliente (não mexe em reservatórios, pois agora são por role)
app.delete("/admin/clientes/:id", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM clientes WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// criar reservatório (agora exige role_id no body)
app.post("/admin/reservatorios", auth, adminOnly, async (req, res) => {
  const { role_id, nome, volume_l } = req.body || {};
  if (!role_id || !nome || !volume_l) {
    return res.status(400).json({ error: "role_id, nome, volume_l" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO reservatorios (role_id, nome, volume_l)
       VALUES ($1,$2,$3)
       RETURNING id, role_id, nome, volume_l, created_at`,
      [role_id, nome, volume_l]
    );
    res.json({ reservatorio: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// editar reservatório (nome, volume_l, role_id)
app.patch("/admin/reservatorios/:id", auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, volume_l, role_id } = req.body || {};
  const sets = [];
  const params = [];
  let i = 1;

  if (typeof nome === 'string')  { sets.push(`nome=$${i++}`);     params.push(nome); }
  if (Number.isFinite(volume_l)) { sets.push(`volume_l=$${i++}`); params.push(volume_l); }
  if (Number.isInteger(role_id)) { sets.push(`role_id=$${i++}`);  params.push(role_id); }

  if (!sets.length) return res.json({ ok: true, unchanged: true });

  params.push(id);
  try {
    const r = await pool.query(`UPDATE reservatorios SET ${sets.join(', ')} WHERE id=$${i} RETURNING id`, params);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// excluir reservatório
app.delete("/admin/reservatorios/:id", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM reservatorios WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ROLES =====
// criar role
app.post("/admin/roles", auth, adminOnly, async (req, res) => {
  const { nome } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: "nome obrigatório" });
  try {
    const r = await pool.query(
      "INSERT INTO client_roles (nome) VALUES ($1) RETURNING id, nome",
      [nome.trim()]
    );
    res.json({ role: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// editar role (nome)
app.patch("/admin/roles/:id", auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: "nome obrigatório" });
  try {
    const r = await pool.query(
      "UPDATE client_roles SET nome=$1 WHERE id=$2 RETURNING id",
      [nome.trim(), id]
    );
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// remover role (atenção a FKs)
app.delete("/admin/roles/:id", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM client_roles WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Overview unificado (clientes + reservatórios + roles) =====
app.get("/admin/overview", auth, adminOnly, async (req, res) => {
  const qStr = (req.query.q || "").toString().trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10), 1), 500);

  try {
    // clientes
    let sqlC = `
      SELECT c.id, c.nome, c.email, c.role_id, c.created_at, cr.nome AS role_name
      FROM clientes c
      LEFT JOIN client_roles cr ON cr.id = c.role_id
    `;
    const pC = [];
    const condC = [];
    if (qStr) condC.push(`(c.nome ILIKE $${pC.push('%'+qStr+'%')} OR c.email ILIKE $${pC.push('%'+qStr+'%')} OR cr.nome ILIKE $${pC.push('%'+qStr+'%')})`);
    if (condC.length) sqlC += " WHERE " + condC.join(" AND ");
    sqlC += " ORDER BY c.id DESC LIMIT " + limit;
    const clientes = (await pool.query(sqlC, pC)).rows;

    // reservatórios
    let sqlR = `
      SELECT r.id, r.role_id, r.nome, r.volume_l, r.created_at, cr.nome AS role_name
      FROM reservatorios r
      LEFT JOIN client_roles cr ON cr.id = r.role_id
    `;
    const pR = [];
    const condR = [];
    if (qStr) condR.push(`(r.nome ILIKE $${pR.push('%'+qStr+'%')} OR cr.nome ILIKE $${pR.push('%'+qStr+'%')})`);
    if (condR.length) sqlR += " WHERE " + condR.join(" AND ");
    sqlR += " ORDER BY r.id DESC LIMIT " + limit;
    const reservatorios = (await pool.query(sqlR, pR)).rows;

    // roles (filtro por nome OU id numérico)
    let sqlRole = `SELECT id, nome FROM client_roles`;
    const pRole = [];
    const condRole = [];
    if (qStr) {
      condRole.push(`nome ILIKE $${pRole.push('%' + qStr + '%')}`);
      if (/^\d+$/.test(qStr)) {
        condRole.push(`id = $${pRole.push(parseInt(qStr, 10))}`);
      }
    }
    if (condRole.length) sqlRole += " WHERE " + condRole.join(" OR ");
    sqlRole += ` ORDER BY id DESC LIMIT ${limit}`;
    const roles = (await pool.query(sqlRole, pRole)).rows;

    res.json({ clientes, reservatorios, roles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========= SSE =========

// ======== SSE (tempo real) ======== //
const clients = new Set(); // Set global compartilhado
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || '*'; // se front e API forem domínios diferentes, informe a origem

app.get("/stream", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  // Headers corretos p/ SSE atrás de proxies e local
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);

  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const client = { id: user.id, res };

    // Heartbeat p/ manter conexão viva (25s)
    client._hb = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
    }, 25000);

    // Sinal de conexão OK
    res.write(`event: hello\ndata: "ok"\n\n`);

    clients.add(client);
    req.on("close", () => {
      clearInterval(client._hb);
      clients.delete(client);
    });
  } catch {
    return res.status(401).end();
  }
});

// LISTEN/NOTIFY (apenas UMA conexão e UM handler)
const listenClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await listenClient.connect();
await listenClient.query("LISTEN registros_channel");

listenClient.on("notification", async (msg) => {
  try {
    const payload = JSON.parse(msg.payload); // { reservatorio_id, registro:{...} }
    const { reservatorio_id } = payload;

    // Mapeia todos os clientes que têm acesso a esse reservatório via role_id
    const resOwn = await pool.query(
      `SELECT c.id AS cliente_id
         FROM reservatorios r
         JOIN clientes c ON c.role_id = r.role_id
        WHERE r.id = $1`,
      [reservatorio_id]
    );
    if (!resOwn.rowCount) return;

    const allowedIds = new Set(resOwn.rows.map(x => x.cliente_id));
    for (const c of clients) {
      if (allowedIds.has(c.id)) {
        c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }
  } catch (e) {
    console.error("erro ao processar notification:", e);
  }
});

app.listen(process.env.PORT, () =>
  console.log("API online na porta", process.env.PORT)
);
