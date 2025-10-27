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
  connectionString: process.env.DATABASE_URL, // ...?sslmode=require
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET   = process.env.JWT_SECRET;
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || "emailespecialadmin@central.com";

// ======== AUTH ======== //
app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ error: "email e senha obrigatórios" });

  try {
    const r = await pool.query(
      "SELECT id, email, password_hash FROM clientes WHERE email=$1",
      [email]
    );
    if (!r.rows.length) return res.status(401).json({ error: "usuário não encontrado" });
    const ok = await bcrypt.compare(senha, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "senha incorreta" });

    const isAdmin = r.rows[0].email === ADMIN_EMAIL;
    const token = jwt.sign(
      { id: r.rows[0].id, email: r.rows[0].email, isAdmin },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
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

// ======== RESERVATÓRIOS ======== //
app.get("/reservatorios", auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, nome, volume_l FROM reservatorios WHERE cliente_id=$1 ORDER BY id",
      [req.user.id]
    );
    res.json({ reservatorios: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// **NOVO**: últimos N registros (default 5) — usado no dashboard 2.0
app.get("/reservatorios/:id/ultimos", auth, async (req, res) => {
  try {
    const rid = Number(req.params.id);
    const own = await pool.query(
      "SELECT 1 FROM reservatorios WHERE id=$1 AND cliente_id=$2",
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

// REGISTROS (com filtro opcional de período) — usado na página histórico
app.get("/reservatorios/:id/registros", auth, async (req, res) => {
  try {
    const rid = Number(req.params.id) || 0;
    const own = await pool.query(
      "SELECT 1 FROM reservatorios WHERE id=$1 AND cliente_id=$2",
      [rid, req.user.id]
    );
    if (!own.rowCount) return res.status(403).json({ error: "reservatório não autorizado" });

    // períodos vindos do <input type="datetime-local"> (hora LOCAL, sem TZ)
    const from = (req.query.from || "").trim(); // "YYYY-MM-DDTHH:mm"
    const to   = (req.query.to   || "").trim();

    const haveRange = !!(from || to);
    const limitQ = haveRange
      ? Math.min(Math.max(parseInt(req.query.limit || "500", 10), 1), 2000)
      : 10;

    // Converte local->APP_TZ->timestamptz
    // “to” INCLUSIVO: < (to + 1 minuto)
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

// ====================================================================================================
// =============== ADMIN (extra) ===============
function escapeIdent(str = "") { return String(str).replace(/[^a-zA-Z0-9_]/g, ""); }
function escapeLiteral(str = "") { return String(str).replace(/'/g, "''"); }

// middleware: somente admin
function adminOnly(req, res, next) {
  if (!req.user?.email || req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "apenas admin" });
  }
  next();
}

// Verifica acesso do admin
app.get("/admin/check", auth, adminOnly, (_req, res) => {
  res.json({ ok: true });
});

// Criar cliente + ROLE (ESP)
app.post("/admin/clientes", auth, adminOnly, async (req, res) => {
  const { nome, email, senha, dbPassword } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ error: "nome, email, senha" });

  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // cria placeholder
    const ins = await c.query(
      "INSERT INTO clientes (nome, email, db_role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
      [nome, email, "to_be_set", "to_be_set"]
    );
    const id = ins.rows[0].id;

    // cria role de banco (DDL não aceita placeholders)
    const roleName  = `client_${id}`;
    const roleIdent = escapeIdent(roleName);
    const dbPwd     = dbPassword || senha;
    await c.query(`CREATE ROLE ${roleIdent} WITH LOGIN PASSWORD '${escapeLiteral(dbPwd)}'`);

    // hash para login web
    const webHash = await bcrypt.hash(senha, 10);

    await c.query("UPDATE clientes SET db_role=$1, password_hash=$2 WHERE id=$3",
      [roleName, webHash, id]
    );

    await c.query("COMMIT");
    res.json({ id, roleName, webPassword: senha, dbPassword: dbPwd });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    c.release();
  }
});

// Criar reservatório (owner_role herdado do cliente)
app.post("/admin/reservatorios", auth, adminOnly, async (req, res) => {
  const { cliente_id, nome, volume_l } = req.body || {};
  if (!cliente_id || !nome || !volume_l) {
    return res.status(400).json({ error: "cliente_id, nome, volume_l" });
  }

  try {
    const q = await pool.query("SELECT db_role FROM clientes WHERE id=$1", [cliente_id]);
    if (!q.rowCount) return res.status(404).json({ error: "cliente não encontrado" });

    const r = await pool.query(
      "INSERT INTO reservatorios (cliente_id, nome, volume_l, owner_role) VALUES ($1,$2,$3,$4) RETURNING *",
      [cliente_id, nome, volume_l, q.rows[0].db_role]
    );
    res.json({ reservatorio: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Excluir reservatório
app.delete("/admin/reservatorios/:id", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM reservatorios WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Excluir cliente (requer FKs com ON DELETE CASCADE para reservatórios/registros)
app.delete("/admin/clientes/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const del = await c.query("DELETE FROM clientes WHERE id=$1 RETURNING db_role", [id]);
    if (!del.rowCount) {
      await c.query("ROLLBACK");
      return res.status(404).json({ error: "não encontrado" });
    }

    const roleIdent = escapeIdent(del.rows[0].db_role || "");
    if (roleIdent) {
      await c.query(`DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${escapeLiteral(roleIdent)}') THEN
          EXECUTE format('REASSIGN OWNED BY %I TO CURRENT_USER', '${roleIdent}');
          EXECUTE format('DROP OWNED BY %I', '${roleIdent}');
          EXECUTE format('DROP ROLE %I', '${roleIdent}');
        END IF;
      END $$;`);
    }

    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    c.release();
  }
});




// Atualizar cliente (nome, email, db_role)
app.patch("/admin/clientes/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, email, db_role } = req.body || {};

    const campos = [];
    const valores = [];
    let i = 1;

    if (nome) { campos.push(`nome=$${i++}`); valores.push(nome); }
    if (email) { campos.push(`email=$${i++}`); valores.push(email); }
    if (db_role) { campos.push(`db_role=$${i++}`); valores.push(db_role); }

    if (!campos.length) return res.status(400).json({ error: "nenhum campo para atualizar" });

    const sql = `UPDATE clientes SET ${campos.join(", ")} WHERE id=$${i} RETURNING *`;
    valores.push(id);

    const r = await pool.query(sql, valores);
    if (!r.rowCount) return res.status(404).json({ error: "cliente não encontrado" });

    res.json({ ok: true, cliente: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Atualizar reservatório (nome, volume_l)
app.patch("/admin/reservatorios/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, volume_l } = req.body || {};

    const campos = [];
    const valores = [];
    let i = 1;

    if (nome) { campos.push(`nome=$${i++}`); valores.push(nome); }
    if (volume_l) { campos.push(`volume_l=$${i++}`); valores.push(volume_l); }

    if (!campos.length) return res.status(400).json({ error: "nenhum campo para atualizar" });

    const sql = `UPDATE reservatorios SET ${campos.join(", ")} WHERE id=$${i} RETURNING *`;
    valores.push(id);

    const r = await pool.query(sql, valores);
    if (!r.rowCount) return res.status(404).json({ error: "reservatório não encontrado" });

    res.json({ ok: true, reservatorio: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});









// Overview com filtros/busca
app.get("/admin/overview", auth, adminOnly, async (req, res) => {
  const qStr = (req.query.q || "").toString().trim();
  const clienteId = parseInt(req.query.cliente_id || "0", 10);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);

  try {
    // clientes
    let sqlC = "SELECT id, nome, email, db_role, created_at FROM clientes";
    const pC = [];
    if (qStr) {
      sqlC += " WHERE (nome ILIKE $1 OR email ILIKE $1 OR db_role ILIKE $1)";
      pC.push(`%${qStr}%`);
    }
    sqlC += " ORDER BY id DESC LIMIT " + limit;
    const clientes = (await pool.query(sqlC, pC)).rows;

    // --- Reservatórios: 
let sqlR = `
  SELECT
    r.id,
    r.cliente_id,
    r.nome,
    r.volume_l,
    r.created_at,
    c.db_role AS cliente_role        
  FROM reservatorios r
  JOIN clientes c ON c.id = r.cliente_id
`;
const pR = [];
const cond = [];
if (clienteId) cond.push(`r.cliente_id = $${pR.push(clienteId)}`);
if (qStr) cond.push(`(r.nome ILIKE $${pR.push('%'+qStr+'%')} OR c.db_role ILIKE $${pR.push('%'+qStr+'%')})`);
if (cond.length) sqlR += " WHERE " + cond.join(" AND ");
sqlR += " ORDER BY r.id DESC LIMIT " + limit;

const reservatorios = (await pool.query(sqlR, pR)).rows;


    res.json({ clientes, reservatorios });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======== SSE (tempo real) ======== //
const clients = new Set();

app.get("/stream", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const client = { id: user.id, res };
    clients.add(client);
    req.on("close", () => clients.delete(client));
  } catch {
    res.status(401).end();
  }
});

// LISTEN/NOTIFY
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

    const resOwn = await pool.query(
      "SELECT cliente_id FROM reservatorios WHERE id=$1",
      [reservatorio_id]
    );
    if (!resOwn.rows.length) return;
    const clienteId = resOwn.rows[0].cliente_id;

    for (const c of clients) {
      if (c.id === clienteId) {
        c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }
  } catch (e) {
    console.error("erro ao processar notification:", e);
  }
});

app.listen(process.env.PORT || 4000, () =>
  console.log("API online na porta", process.env.PORT || 4000)
);
