// Prueba de punta a punta del receptor ESP32 contra los emuladores (sin hardware):
// cuenta propia del dispositivo → /alertas/{zona} con las reglas reales → misma lógica que maqueta/AlarmaPREVIUNT/src/main.cpp.
// Necesita los emuladores de Auth (9099) y Realtime Database (9000) corriendo (ver LEEME.md).
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, set, update } from "firebase/database";
import fs from "fs";
import { config, iniciarSesion, leerAlerta, validar, Maquina } from "../maqueta/probar_dispositivo.mjs";

const P = "demo-previunt3", Z = "san-ildefonso-01";
const env = await initializeTestEnvironment({ projectId: P, database: { rules: fs.readFileSync("../database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
await env.clearDatabase();
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
const cuenta = async (email, clave) => (await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: clave }) })).json()).localId;
const esp = await cuenta("esp32-01@dispositivos.previunt.invalid", "clave-dispositivo-1");
const espInactivo = await cuenta("esp32-02@dispositivos.previunt.invalid", "clave-dispositivo-2");
await env.withSecurityRulesDisabled(async (c) => {
  await update(ref(c.database()), {
    "admins/adm1": true,
    [`dispositivos/${esp}`]: { zona: Z, activo: true, nombre: "maqueta" },
    [`dispositivos/${espInactivo}`]: { zona: Z, activo: false, nombre: "revocado" }
  });
});
const adm = env.authenticatedContext("adm1", { email: "clau_udio@previunt.invalid", firebase: { sign_in_provider: "password" } }).database();
const publicar = (nivel, evt) => {
  const s = Math.floor(Date.now() / 1000);
  return update(ref(adm), {
    quebrada_san_ildefonso: { nivel, zona: Z, eventId: evt, updatedAt: s, validUntil: s + 3600, actualizado: Date.now(), origen: "autoridad" },
    [`alertas/${Z}`]: { level: nivel, origin: "authority", zone: Z, eventId: evt, updatedAt: s, validUntil: s + 3600 }
  });
};

let ok = 0, mal = 0;
const t = async (n, f) => { try { await f(); ok++; console.log("OK   ", n); } catch (e) { mal++; console.log("FALLA", n, "→", e.message); } };
const c = config({ EMULADOR: "1", DEVICE_EMAIL: "esp32-01@dispositivos.previunt.invalid", DEVICE_PASSWORD: "clave-dispositivo-1", ZONA: Z });
const m = new Maquina();
let token;
const lectura = async (tok = token, cc = c) => { const r = await leerAlerta(cc, tok); if (r.codigo !== 200) return `HTTP ${r.codigo}`; return m.procesar(validar(r.texto, cc.zona)); };

await t("el dispositivo inicia sesión con su propia cuenta", async () => { token = await iniciarSesion(c); });
await t("clave incorrecta: sesión rechazada", async () => {
  try { await iniciarSesion({ ...c, password: "mala" }); } catch { return; } throw new Error("aceptó una clave incorrecta");
});
await t("sin alerta publicada: no hace nada", async () => { const r = await lectura(); if (!r.includes("ignorada")) throw new Error(r); });
await publicar(3, "evt-a");
await t("desborde: 1.ª lectura = candidato (no suena)", async () => { const r = await lectura(); if (!r.includes("candidato") || m.alarma) throw new Error(r); });
await t("desborde: 2.ª lectura igual = ACTIVA", async () => { const r = await lectura(); if (!r.includes("ACTIVA") || !m.alarma) throw new Error(r); });
await t("renovación del mismo evento: sigue sonando, no es alarma nueva", async () => { await publicar(3, "evt-a"); const r = await lectura(); if (!r.includes("sigue sonando")) throw new Error(r); });
await t("error de red / respuesta inválida: no apaga ni enciende", async () => { const r = m.procesar(validar("<html>error</html>", Z)); if (!r.includes("ignorada") || !m.alarma) throw new Error(r); });
await publicar(0, "evt-b");
await t("despeje: 1.ª lectura = candidato (sigue sonando)", async () => { const r = await lectura(); if (!r.includes("candidato") || !m.alarma) throw new Error(r); });
await t("despeje: 2.ª lectura = APAGA", async () => { const r = await lectura(); if (!r.includes("APAGA") || m.alarma) throw new Error(r); });
await publicar(3, "evt-c");
await lectura(); await lectura();
await t("desborde vencido (la autoridad no lo renovó) cuenta como despeje y apaga en 2 lecturas", async () => {
  const r = await leerAlerta(c, token), futuro = Math.floor(Date.now() / 1000) + 4000;
  const a = m.procesar(validar(r.texto, Z, futuro)), b = m.procesar(validar(r.texto, Z, futuro));
  if (!a.includes("VENCIDO") || !b.includes("APAGA") || m.alarma) throw new Error(a + " / " + b);
});
await t("alerta de otra zona en el registro: ignorada", async () => {
  const s = Math.floor(Date.now() / 1000);
  const r = m.procesar(validar(JSON.stringify({ level: 3, origin: "authority", zone: "otra", eventId: "x", updatedAt: s, validUntil: s + 60 }), Z));
  if (!r.includes("ignorada")) throw new Error(r);
});
await t("vigencia mayor a 1 h u hora futura: ignorada", async () => {
  const s = Math.floor(Date.now() / 1000);
  const a = validar(JSON.stringify({ level: 3, origin: "authority", zone: Z, eventId: "x", updatedAt: s, validUntil: s + 7200 }), Z);
  const b = validar(JSON.stringify({ level: 3, origin: "authority", zone: Z, eventId: "x", updatedAt: s + 600, validUntil: s + 900 }), Z);
  if (a.tipo !== "invalida" || b.tipo !== "invalida") throw new Error(JSON.stringify([a, b]));
});
await t("el dispositivo NO puede leer otra zona (prueba-01)", async () => { const r = await leerAlerta({ ...c, zona: "prueba-01" }, token); if (r.codigo === 200) throw new Error("pudo leer"); });
await t("dispositivo revocado (activo: false) NO lee", async () => {
  const tok = await iniciarSesion({ ...c, email: "esp32-02@dispositivos.previunt.invalid", password: "clave-dispositivo-2" });
  const r = await leerAlerta(c, tok); if (r.codigo === 200) throw new Error("pudo leer");
});
await t("sin token NO se lee /alertas", async () => { const r = await leerAlerta(c, ""); if (r.codigo === 200) throw new Error("pudo leer sin sesión"); });

console.log(`\nFIN ${ok} OK, ${mal} fallas`);
await env.cleanup(); process.exit(mal ? 1 : 0);
