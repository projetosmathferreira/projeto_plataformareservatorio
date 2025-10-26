// platform_api.js
// API principal da plataforma (PostgreSQL + SSE + JWT)
// npm i express pg bcrypt jsonwebtoken cors

import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";

const { Pool } = pkg;
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto";

// ======== AUTENTICAÇÃO ======== //
app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ error: "email e senha obrigatórios" });

  try {
    const r = await pool.query("SELECT id, password_hash FROM clientes WHERE email=$1", [email]);
    if (!r.rows.length) return res.status(401).json({ error: "usuário não encontrado" });
    const ok = await bcrypt.compare(senha, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "senha incorreta" });

    const token = jwt.sign({ id: r.rows[0].id }, JWT_SECRET, { expiresIn: "7d" });
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
  const r = await pool.query(
    "SELECT id, nome, volume_l FROM reservatorios WHERE cliente_id=$1 ORDER BY id",
    [req.user.id]
  );
  res.json({ reservatorios: r.rows });
});

// ======== REGISTROS ======== //
app.get("/reservatorios/:id/registros", auth, async (req, res) => {
  const rid = req.params.id;
  const ok = await pool.query(
    "SELECT id FROM reservatorios WHERE id=$1 AND cliente_id=$2",
    [rid, req.user.id]
  );
  if (!ok.rows.length) return res.status(403).json({ error: "reservatório não autorizado" });

  const r = await pool.query(
    "SELECT * FROM registros WHERE reservatorio_id=$1 ORDER BY recorded_at DESC",
    [rid]
  );
  res.json({ registros: r.rows });
});

// ======== SSE STREAM (tempo real) ======== //
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

// listener de notificações do PostgreSQL
const listenClient = new pkg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await listenClient.connect();
await listenClient.query("LISTEN new_registro");

listenClient.on("notification", async (msg) => {
  const payload = JSON.parse(msg.payload);
  for (const c of clients) {
    if (c.id === payload.cliente_id) {
      c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }
});

app.listen(process.env.PORT || 4000, () => console.log("API online na porta 4000"));
