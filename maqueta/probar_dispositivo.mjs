#!/usr/bin/env node
/* PREVIUNT · Probar la cuenta de un ESP32 SIN hardware (Node 18+, sin dependencias).
   Hace lo mismo que AlarmaPREVIUNT.ino: inicia sesión con la cuenta del dispositivo, lee /alertas/{zona}
   y aplica la misma validación y la misma lógica (2 lecturas iguales para activar, 2 de despeje para apagar).

   Uso (los valores van en variables de entorno, nunca en el código):
     FIREBASE_API_KEY=...  DEVICE_EMAIL=esp32-01@dispositivos.previunt.invalid  DEVICE_PASSWORD=...  \
     ZONA=prueba-01  node maqueta/probar_dispositivo.mjs            # una lectura
     ... node maqueta/probar_dispositivo.mjs --vigilar               # lee cada 3 s como el ESP32 (Ctrl+C para salir)
   Opcional: DATABASE_URL (por defecto https://previunt-default-rtdb.firebaseio.com) · EMULADOR=1 (pruebas locales) */

export const MAX_FUTURE_SKEW_SEC = 30, MAX_VALIDITY_SEC = 3600;

export function config(env = process.env) {
  const emu = env.EMULADOR === "1";
  return {
    apiKey: env.FIREBASE_API_KEY || (emu ? "fake-key" : ""),
    email: env.DEVICE_EMAIL || "", password: env.DEVICE_PASSWORD || "", zona: env.ZONA || "san-ildefonso-01",
    authBase: emu ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com",
    dbUrl: emu ? "http://127.0.0.1:9000" : (env.DATABASE_URL || "https://previunt-default-rtdb.firebaseio.com"),
    dbNs: emu ? `?ns=${env.PROYECTO || "demo-previunt3"}&` : "?"
  };
}

export async function iniciarSesion(c) {
  const r = await fetch(`${c.authBase}/v1/accounts:signInWithPassword?key=${encodeURIComponent(c.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password, returnSecureToken: true })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.idToken) throw new Error(`inicio de sesión rechazado (HTTP ${r.status} ${j.error?.message || ""}): el ESP32 no cambiaría el buzzer`);
  return j.idToken;
}

export async function leerAlerta(c, idToken) {
  const r = await fetch(`${c.dbUrl}/alertas/${encodeURIComponent(c.zona)}.json${c.dbNs}auth=${encodeURIComponent(idToken)}`);
  const texto = await r.text();
  return { codigo: r.status, texto };
}

/* Igual que parseAndValidate() del .ino: { tipo: "invalida" | "vigente" | "vencida", level, eventId, motivo } */
export function validar(texto, zona, ahoraSeg = Math.floor(Date.now() / 1000)) {
  let d;
  try { d = JSON.parse(texto); } catch { return { tipo: "invalida", motivo: "JSON inválido" }; }
  if (d === null) return { tipo: "invalida", motivo: "no hay alerta publicada para esta zona" };
  const entero = (x) => Number.isInteger(x) && x >= 0;
  if (!Number.isInteger(d.level) || typeof d.origin !== "string" || typeof d.zone !== "string" || typeof d.eventId !== "string" || !entero(d.updatedAt) || !entero(d.validUntil))
    return { tipo: "invalida", motivo: "respuesta incompleta" };
  if (d.origin !== "authority" || d.zone !== zona || !d.eventId) return { tipo: "invalida", motivo: "fuente, zona o evento no autorizados" };
  if (d.level < 0 || d.level > 3) return { tipo: "invalida", motivo: "nivel fuera de rango" };
  if (d.updatedAt > ahoraSeg + MAX_FUTURE_SKEW_SEC || d.validUntil <= d.updatedAt || d.validUntil - d.updatedAt > MAX_VALIDITY_SEC)
    return { tipo: "invalida", motivo: "hora o vigencia inválidas" };
  if (ahoraSeg > d.validUntil) return { tipo: "vencida", level: d.level, eventId: d.eventId };
  return { tipo: "vigente", level: d.level, eventId: d.eventId };
}

/* Igual que acceptResponse() del .ino */
export class Maquina {
  constructor() { Object.assign(this, { alarma: false, activo: "", cand: "", nCand: 0, candDespeje: "", nDespeje: 0 }); }
  aceptar(level, eventId) {
    if (level === 3) {
      this.candDespeje = ""; this.nDespeje = 0;
      if (eventId === this.activo && this.alarma) return "sigue sonando (mismo evento)";
      if (this.cand === eventId) this.nCand = Math.min(2, this.nCand + 1); else { this.cand = eventId; this.nCand = 1; }
      if (this.nCand >= 2) { this.activo = eventId; this.alarma = true; return `ACTIVA LA ALARMA (${eventId})`; }
      return "desborde candidato: espera una segunda lectura igual";
    }
    this.cand = ""; this.nCand = 0;
    if (!this.alarma) return "sin alarma (despeje)";
    if (this.candDespeje === eventId) this.nDespeje = Math.min(2, this.nDespeje + 1); else { this.candDespeje = eventId; this.nDespeje = 1; }
    if (this.nDespeje >= 2) { Object.assign(this, { alarma: false, activo: "", candDespeje: "", nDespeje: 0 }); return "APAGA LA ALARMA (despeje autorizado)"; }
    return "despeje candidato: espera una segunda lectura";
  }
  /* Una lectura completa (resultado de validar) → qué haría el ESP32 */
  procesar(v) {
    if (v.tipo === "invalida") return `ignorada (${v.motivo}): el buzzer no cambia`;
    if (v.tipo === "vencida") return (v.level === 3 ? "desborde VENCIDO → cuenta como despeje: " : "") + this.aceptar(0, v.eventId + "#vencido");
    return this.aceptar(v.level, v.eventId);
  }
}

async function main() {
  const c = config(), vigilar = process.argv.includes("--vigilar");
  if (!c.apiKey || !c.email || !c.password) {
    console.error("Faltan variables: FIREBASE_API_KEY, DEVICE_EMAIL, DEVICE_PASSWORD (y ZONA). Ver maqueta/LEEME.md");
    process.exit(2);
  }
  const m = new Maquina();
  let token = null;
  do {
    try {
      token = token || await iniciarSesion(c);
      const { codigo, texto } = await leerAlerta(c, token);
      const hora = new Date().toLocaleTimeString("es-PE", { hour12: false });
      if (codigo === 401 || codigo === 403) { console.log(`${hora} Firebase HTTP ${codigo}: sin permiso (¿dispositivo inactivo u otra zona?). El buzzer no cambia.`); token = null; }
      else if (codigo !== 200) console.log(`${hora} Firebase HTTP ${codigo}: el buzzer no cambia.`);
      else console.log(`${hora} ${texto}\n         → ${m.procesar(validar(texto, c.zona))}`);
    } catch (e) { console.log(String(e.message || e)); }
    if (vigilar) await new Promise((r) => setTimeout(r, 3000));
  } while (vigilar);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
