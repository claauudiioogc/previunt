import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, update } from "firebase/database";
import fs from "fs";
const P = "demo-previunt3";
const env = await initializeTestEnvironment({ projectId: P, database: { rules: fs.readFileSync("../database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
await env.clearDatabase();
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
for (const [u, clave] of [["clau_udio", "clave-prueba-1"], ["joa_quin", "clave-prueba-2"], ["cris_thian", "clave-prueba-3"]]) {
  const r = await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@previunt.invalid`, password: clave }) })).json();
  if (!r.localId) throw new Error(JSON.stringify(r));
  await env.withSecurityRulesDisabled(async (x) => { await update(ref(x.database()), { [`admins/${r.localId}`]: true, [`nombres_usuario/${u}`]: r.localId, [`perfiles/${r.localId}`]: { usuario: u, avatar: "don_clava", creado: Date.now() } }); });
  console.log("admin", u, r.localId);
}
await env.cleanup(); process.exit(0);
