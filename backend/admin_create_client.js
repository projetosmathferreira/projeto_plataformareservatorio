// admin_create_client.js
// Cria clientes e roles PostgreSQL manualmente
// Uso (Linux/Mac): node admin_create_client.js '{"nome":"Luis","email":"luis@ex.com","dbPassword":"MinhaSenha123","createReservatorio":true}'

import { Client } from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";

if (!process.env.DATABASE_URL) {
  console.error("Defina a variável DATABASE_URL");
  process.exit(1);
}

// helpers de escape para evitar problemas com aspas
function escapeLiteral(str = "") {
  return String(str).replace(/'/g, "''");
}
function escapeIdent(str = "") {
  // roleName é no formato client_<id>, então já é seguro; ainda assim, removemos caracteres fora do permitido
  return String(str).replace(/[^a-zA-Z0-9_]/g, "");
}

async function main() {
  const input = JSON.parse(process.argv[2] || "{}");
  const { nome, email, dbPassword, createReservatorio, reservName, volume_l } = input;
  if (!nome || !email) {
    console.error("nome e email são obrigatórios");
    process.exit(1);
  }

  const admin = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await admin.connect();

  try {
    await admin.query("BEGIN");

    const ins = await admin.query(
      "INSERT INTO clientes (nome, email, db_role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
      [nome, email, "to_be_set", ""]
    );
    const id = ins.rows[0].id;
    const roleName = `client_${id}`;
    const pwd = dbPassword || crypto.randomBytes(10).toString("hex");

    // <<< AQUI ESTAVA O PROBLEMA: não usar $1; use literal escapado >>>
    const roleIdent = escapeIdent(roleName);
    const pwdLit = escapeLiteral(pwd);
    await admin.query(`CREATE ROLE ${roleIdent} WITH LOGIN PASSWORD '${pwdLit}'`);

    const hash = bcrypt.hashSync(pwd, 10);

    await admin.query(
      "UPDATE clientes SET db_role=$1, password_hash=$2 WHERE id=$3",
      [roleName, hash, id]
    );

    if (createReservatorio) {
      await admin.query(
        "INSERT INTO reservatorios (cliente_id, nome, volume_l, owner_role) VALUES ($1,$2,$3,$4)",
        [id, reservName || "Principal", volume_l || 1000, roleName]
      );
    }

    await admin.query("COMMIT");
    console.log(JSON.stringify({ id, roleName, password: pwd }));
  } catch (e) {
    await admin.query("ROLLBACK");
    console.error("Erro:", e.message || e);
    process.exit(1);
  } finally {
    await admin.end();
  }
}

main();
