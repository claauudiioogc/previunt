import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get, update, serverTimestamp } from "firebase/database";
import fs from "fs";
const env = await initializeTestEnvironment({ projectId: "demo-previunt3",
  database: { rules: fs.readFileSync("../database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
const DOM = "@previunt.invalid";
await env.clearDatabase();
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.database();
  // 3 admins de prueba creados desde la consola (sin teléfono, correo sintético)
  for (const [uid, u] of [["adm1", "clau_udio"], ["adm2", "joa_quin"], ["adm3", "cris_thian"]]) {
    await set(ref(d, "admins/" + uid), true);
    await set(ref(d, "nombres_usuario/" + u), uid);
    await set(ref(d, "perfiles/" + uid), { usuario: u, avatar: "escudo", creado: 1 });
  }
  await set(ref(d, "dispositivos/esp1"), true);
  await set(ref(d, "bloqueados/malo"), true);
});
const ctx = (uid, t) => env.authenticatedContext(uid, t).database();
const personal = (u, tel = "+51987000001") => ({ email: u + DOM, email_verified: false, phone_number: tel, firebase: { sign_in_provider: "password" } });
const sinCel = (u) => ({ email: u + DOM, email_verified: false, firebase: { sign_in_provider: "password" } });
const untTok = (c, ver = true) => ({ email: c, email_verified: ver, firebase: { sign_in_provider: "password" } });
const anon = ctx("anon1", { firebase: { sign_in_provider: "anonymous" } });
const nadie = env.unauthenticatedContext().database();
const ana = ctx("ana", personal("ana_m"));
const beto = ctx("beto", personal("beto_r", "+51987000002"));
const lia = ctx("lia", sinCel("lia_p"));                        // registró pero no verificó SMS
const est = ctx("est", untTok("est@unitru.edu.pe"));
const estNo = ctx("estno", untTok("nov@unitru.edu.pe", false)); // no abrió el enlace
const adm = ctx("adm1", { email: "clau_udio" + DOM, email_verified: false, firebase: { sign_in_provider: "password" } });
const esp = ctx("esp1", { email: "maqueta" + DOM, email_verified: false, firebase: { sign_in_provider: "password" } });
const malo = ctx("malo", personal("malo_x", "+51987000009"));
const reg = (uid, u, tipo, dni, correo, cel = "+51987000001") => ({
  [`nombres_usuario/${u}`]: uid,
  [`perfiles/${uid}`]: { usuario: u, avatar: "ola-azul", creado: serverTimestamp() },
  [`privado/${uid}`]: { tipo, nombres: "Ana", apellidos: "Mora Ríos", dni, celular: cel, correo, consentimiento: serverTimestamp(), creado: serverTimestamp() },
  [`indice_dni/${tipo}_${dni}`]: uid
});
const rep = (autor, extra = {}) => ({ tipo: "huaico", ambito: "ciudad", forma: "punto", lat: -8.06, lng: -79.0, autor, creado: Date.now(), tieneFoto: false, verificadoAutoridad: false, descripcion: "lodo", ...extra });
const campus = { ambito: "unt", lat: -8.1135, lng: -79.037 };
let ok = 0, bad = 0;
async function t(nombre, esperado, p) {
  try { await (esperado ? assertSucceeds(p) : assertFails(p)); ok++; console.log("OK  ", nombre); }
  catch (e) { bad++; console.log("FALLA", nombre, String(e.message || e).slice(0, 200)); }
}
// --- Registro ---
await t("ana se registra (personal)", true, update(ref(ana), reg("ana", "ana_m", "personal", "12345678", "ana@gmail.com")));
await t("beto NO usa el DNI de ana", false, update(ref(beto), reg("beto", "beto_r", "personal", "12345678", "b@gmail.com")));
await t("beto NO usa un usuario distinto a su login", false, update(ref(beto), reg("beto", "otro_nombre", "personal", "76543210", "b@gmail.com")));
await t("beto NO usa usuario ya tomado (clau_udio)", false, update(ref(beto), reg("beto", "clau_udio", "personal", "76543210", "b@gmail.com")));
await t("beto NO registra DNI de 7 dígitos", false, update(ref(beto), reg("beto", "beto_r", "personal", "1234567", "b@gmail.com")));
await t("beto se registra bien", true, update(ref(beto), reg("beto", "beto_r", "personal", "76543210", "b@gmail.com", "+51987000002")));
await t("lia NO guarda datos sin haber verificado el SMS", false, update(ref(lia), reg("lia", "lia_p", "personal", "11112222", "l@gmail.com")));
await t("UNT NO registra con correo distinto al de la cuenta", false, update(ref(est), reg("est", "est_unt", "unt", "12345678", "otro@unitru.edu.pe")));
await t("est se registra (UNT, mismo DNI que ana: otro tipo)", true, update(ref(est), reg("est", "est_unt", "unt", "12345678", "est@unitru.edu.pe")));
await t("estNo se registra (UNT sin verificar)", true, update(ref(estNo), reg("estno", "nov_unt", "unt", "33334444", "nov@unitru.edu.pe")));
await t("personal NO se declara tipo UNT", false, update(ref(malo), reg("malo", "malo_x", "unt", "55556666", "m@unitru.edu.pe")));
{
  const sinCons = reg("zed", "zed_k", "personal", "88889999", "zed@gmail.com", "+51987000007");
  delete sinCons["privado/zed"].consentimiento;
  await t("registro sin consentimiento (casilla apagada) se acepta", true, update(ref(ctx("zed", personal("zed_k", "+51987000007"))), sinCons));
}
await t("malo se registra", true, update(ref(malo), reg("malo", "malo_x", "personal", "55556666", "m@gmail.com", "+51987000009")));
await t("invitado NO se registra", false, update(ref(anon), reg("anon1", "anon_1", "personal", "99998888", "a@gmail.com")));
await t("perfil con nombre real rechazado", false, update(ref(ana, "perfiles/ana"), { nombre: "Ana" }));
await t("ana cambia su avatar", true, update(ref(ana, "perfiles/ana"), { avatar: "monte-cafe" }));
await t("ana NO cambia su usuario", false, update(ref(ana, "perfiles/ana"), { usuario: "beto_r" }));
await t("ana NO cambia su DNI", false, update(ref(ana, "privado/ana"), { dni: "00000000" }));
await t("ana NO pone un celular distinto al verificado", false, update(ref(ana, "privado/ana"), { celular: "+51912345678" }));
await t("personal NO guarda un celular distinto al verificado", false, update(ref(ctx("zoe", personal("zoe_q", "+51987000005"))), reg("zoe", "zoe_q", "personal", "77778888", "z@gmail.com", "+51911111111")));
await t("ana lee sus datos privados", true, get(ref(ana, "privado/ana")));
await t("beto NO lee datos privados de ana", false, get(ref(beto, "privado/ana")));
await t("admin NO lee datos privados (solo la consola)", false, get(ref(adm, "privado/ana")));
await t("nadie lee el índice de DNI", false, get(ref(adm, "indice_dni")));
await t("cualquiera consulta si un usuario existe", true, get(ref(nadie, "nombres_usuario/ana_m")));
// --- Reportes ---
await t("nadie lee reportes", true, get(ref(nadie, "reportes")));
await t("invitado NO reporta", false, set(ref(anon, "reportes/r0"), rep("anon1")));
await t("ana (SMS verificado) reporta en la ciudad", true, set(ref(ana, "reportes/r1"), rep("ana")));
await t("lia (sin SMS) NO reporta", false, set(ref(lia, "reportes/r2"), rep("lia")));
await t("ana NO reporta en el campus (cuenta personal)", false, set(ref(ana, "reportes/r3"), rep("ana", campus)));
await t("est (UNT) reporta dentro del campus", true, set(ref(est, "reportes/r4"), rep("est", campus)));
await t("est (UNT) NO reporta en la ciudad", false, set(ref(est, "reportes/r5"), rep("est")));
await t("est NO reporta UNT fuera del rectángulo", false, set(ref(est, "reportes/r6"), rep("est", { ambito: "unt" })));
await t("est NO reporta UNT como tramo", false, set(ref(est, "reportes/r7"), rep("est", { ...campus, forma: "tramo" })));
await t("UNT sin verificar correo NO reporta", false, set(ref(estNo, "reportes/r8"), rep("estno", campus)));
await t("bloqueado NO reporta", false, set(ref(malo, "reportes/r9"), rep("malo")));
await t("ana NO reporta a nombre de beto", false, set(ref(ana, "reportes/r10"), rep("beto")));
await t("ana NO se autoverifica", false, set(ref(ana, "reportes/r11"), rep("ana", { verificadoAutoridad: true })));
await t("admin clau_udio reporta en la ciudad", true, set(ref(adm, "reportes/r12"), rep("adm1")));
await t("admin reporta en el campus", true, set(ref(adm, "reportes/r13"), rep("adm1", campus)));
await t("reporte + foto en un update", true, update(ref(ana), { "reportes/r14": rep("ana", { tieneFoto: true }), "fotos/r14": "data:image/jpeg;base64,AAAA" }));
await t("ana NO cambia la gestión", false, update(ref(ana, "reportes/r1"), { gestion: "atendido" }));
await t("admin marca atendido", true, update(ref(adm, "reportes/r1"), { gestion: "atendido", verificadoAutoridad: true, gestionPor: "adm1" }));
// --- Cola sin conexión (cambio A) y foto subida después (cambio B) ---
const hace = (ms) => Date.now() - ms;
await t("reporte de la cola creado hace 1 h se acepta", true, set(ref(ana, "reportes/c1"), rep("ana", { creado: hace(3600e3), tieneFoto: false, fotoPendiente: true })));
await t("reporte creado hace 3 h se rechaza", false, set(ref(ana, "reportes/c2"), rep("ana", { creado: hace(3 * 3600e3) })));
await t("reporte con hora futura (+5 min) se rechaza", false, set(ref(ana, "reportes/c3"), rep("ana", { creado: Date.now() + 300e3 })));
await t("ana NO marca tieneFoto sin haber subido la foto", false, update(ref(ana, "reportes/c1"), { tieneFoto: true, fotoPendiente: null }));
await t("ana sube la foto de su reporte", true, set(ref(ana, "fotos/c1"), "data:image/jpeg;base64,AAAA"));
await t("ana marca tieneFoto y quita fotoPendiente", true, update(ref(ana, "reportes/c1"), { tieneFoto: true, fotoPendiente: null }));
await t("ana NO cambia la descripción de su reporte", false, update(ref(ana, "reportes/c1"), { descripcion: "otra" }));
await t("ana NO cambia confirmaciones de su reporte", false, update(ref(ana, "reportes/c1"), { confirmaciones: 50 }));
await t("beto NO marca tieneFoto en el reporte de ana", false, update(ref(beto, "reportes/c1"), { fotoPendiente: null }));
await t("beto NO sube foto al reporte de ana", false, set(ref(beto, "fotos/r1"), "data:image/jpeg;base64,BBBB"));
// --- Votos ---
const voto = (v = 1) => ({ v, t: serverTimestamp() });
await t("beto vota reporte de ciudad de ana", true, set(ref(beto, "votos/r1/beto"), voto()));
await t("beto NO vota dos veces", false, set(ref(beto, "votos/r1/beto"), voto(-1)));
await t("ana NO vota su reporte", false, set(ref(ana, "votos/r1/ana"), voto()));
await t("est (UNT) NO vota reporte de ciudad", false, set(ref(est, "votos/r1/est"), voto()));
await t("ana (personal) NO vota reporte del campus", false, set(ref(ana, "votos/r4/ana"), voto()));
await t("lia (sin SMS) NO vota", false, set(ref(lia, "votos/r1/lia"), voto()));
await t("invitado NO vota", false, set(ref(anon, "votos/r1/anon1"), voto()));
await t("admin vota reporte del campus", true, set(ref(adm, "votos/r4/adm1"), voto()));
await t("admin escribe voto simulado", true, set(ref(adm, "votos/r1/sim_1"), voto()));
await t("voto con valor 5 rechazado", false, set(ref(beto, "votos/r12/beto"), voto(5)));
// --- Admin / estado ---
await t("nadie NO cambia nivel quebrada", false, set(ref(nadie, "quebrada_san_ildefonso"), { nivel: 3 }));
await t("ana NO cambia nivel quebrada", false, set(ref(ana, "quebrada_san_ildefonso"), { nivel: 3 }));
await t("admin cambia nivel quebrada", true, set(ref(adm, "quebrada_san_ildefonso"), { nivel: 1 }));
await t("maqueta (dispositivo) cambia nivel", true, set(ref(esp, "quebrada_san_ildefonso"), { nivel: 2 }));
await t("ana NO activa demo", false, set(ref(ana, "demo"), { activo: true }));
await t("admin activa demo", true, set(ref(adm, "demo"), { activo: true }));
await t("admin lee su entrada en /admins", true, get(ref(adm, "admins/adm1")));
await t("ana NO se hace admin", false, set(ref(ana, "admins/ana"), true));
await t("admin bloquea a beto", true, set(ref(adm, "bloqueados/beto"), true));
await t("beto bloqueado ya NO vota", false, set(ref(beto, "votos/r12/beto"), voto()));
console.log(`\n${ok} OK, ${bad} fallas`);
await env.cleanup(); process.exit(bad ? 1 : 0);
