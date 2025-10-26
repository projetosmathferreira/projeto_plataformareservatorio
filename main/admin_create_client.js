// admin_create_client.js
// Uso (Linux/Mac):
// export DATABASE_URL="postgresql://.../railway?sslmode=require"
// node admin_create_client.js '{"nome":"Luciana","email":"luciana@ex.com","senha":"1234","dbPassword":"1234"}'

import { Client } from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";

if (!process.env.DATABASE_URL) {
  console.error("Defina a variável DATABASE_URL");
  process.exit(1);
}

function escapeLiteral(str = "") {
  return String(str).replace(/'/g, "''");
}
function escapeIdent(str = "") {
  return String(str).replace(/[^a-zA-Z0-9_]/g, "");
}

async function main() {
  const input = JSON.parse(process.argv[2] || "{}");
  const { nome, email, senha, dbPassword } = input;

  if (!nome || !email || !senha) {
    console.error("Campos obrigatórios: nome, email, senha");
    process.exit(1);
  }

  const admin = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // aceita SSL do Railway só nesta conexão
  });
  await admin.connect();

  try {
    await admin.query("BEGIN");

    // cria cliente
    const ins = await admin.query(
      "INSERT INTO clientes (nome, email, db_role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
      [nome, email, "to_be_set", "to_be_set"]
    );
    const id = ins.rows[0].id;

    const roleName = `client_${id}`;
    const roleIdent = escapeIdent(roleName);
    const dbPwd = dbPassword || senha || crypto.randomBytes(10).toString("hex");
    const dbPwdLit = escapeLiteral(dbPwd);

    // DDL não aceita placeholders: usar literais escapados
    await admin.query(`CREATE ROLE ${roleIdent} WITH LOGIN PASSWORD '${dbPwdLit}'`);

    // hash da senha para login web
    const webHash = bcrypt.hashSync(senha, 10);

    // atualiza cliente com db_role + hash
    await admin.query(
      "UPDATE clientes SET db_role=$1, password_hash=$2 WHERE id=$3",
      [roleName, webHash, id]
    );

    await admin.query("COMMIT");
    console.log(JSON.stringify({ id, roleName, webPassword: senha, dbPassword: dbPwd }));
  } catch (e) {
    await admin.query("ROLLBACK");
    console.error("Erro:", e.message || e);
    process.exit(1);
  } finally {
    await admin.end();
  }
}

main();
