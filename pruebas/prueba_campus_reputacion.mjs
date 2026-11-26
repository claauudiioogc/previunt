// Prueba en Node del bloque "CAMPUS Y REPUTACIÓN" de app.js (no necesita emuladores): node prueba_campus_reputacion.mjs
import fs from "fs";
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const ini = app.indexOf("/* === CAMPUS Y REPUTACIÓN (inicio)"), fin = app.indexOf("/* === CAMPUS Y REPUTACIÓN (fin) === */");
if (ini < 0 || fin < 0) throw new Error("No se encontró el bloque CAMPUS Y REPUTACIÓN en app.js");
const B = new Function("VOTOS_MIN", app.slice(ini, fin) + "\nreturn { dentroDelCampus, CAMPUS_UNT, CAMPUS_BBOX, contarVotos, mezclarVotos, puntosDe, nivelDe };")(3);
const reglas = JSON.parse(fs.readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"));

let ok = 0, mal = 0;
const t = (n, cond) => { if (cond) { ok++; console.log("OK   " + n); } else { mal++; console.log("FALLA " + n); } };

t("punto dentro del campus (-8.1135, -79.0370)", B.dentroDelCampus(-8.1135, -79.0370));
t("punto fuera (-8.1200, -79.0400)", !B.dentroDelCampus(-8.1200, -79.0400));
t("Trujillo centro fuera", !B.dentroDelCampus(-8.1116, -79.0288));
t("muesca entre los vértices 13 y 16 fuera (-8.1140, -79.0410)", !B.dentroDelCampus(-8.1140, -79.0410));
t("todos los vértices dentro del rectángulo", B.CAMPUS_UNT.every(([lng, lat]) => lat >= B.CAMPUS_BBOX.latMin && lat <= B.CAMPUS_BBOX.latMax && lng >= B.CAMPUS_BBOX.lngMin && lng <= B.CAMPUS_BBOX.lngMax));
const amb = reglas.rules.reportes.$id.ambito[".validate"];
t("el rectángulo de las reglas es el mismo que el de la app", [B.CAMPUS_BBOX.latMin, B.CAMPUS_BBOX.latMax, B.CAMPUS_BBOX.lngMin, B.CAMPUS_BBOX.lngMax].every((v) => amb.includes(String(v.toFixed(5)))));

const votos = { r1: { b: { v: 1, t: 10 }, c: { v: 1, t: 20 }, d: { v: 1, t: 30 } }, r2: { b: { v: -1, t: 5 }, c: { v: -1, t: 6 }, d: { v: 1, t: 7 } } };
const reportes = { r1: { autor: "a", creado: 1 }, r2: { autor: "a", creado: 1 }, r3: { autor: "z", creado: 1, verificadoAutoridad: true } };
B.mezclarVotos(reportes, votos);
t("mezclarVotos copia los conteos", reportes.r1.confirmaciones === 3 && reportes.r1.negaciones === 0 && reportes.r2.negaciones === 2 && reportes.r1.ultimaConfirmacion === 30);
const estado = (r) => (r.confirmaciones + r.negaciones >= 3 && r.negaciones > r.confirmaciones ? "descartado" : "x");
const pa = B.puntosDe("a", { r1: reportes.r1 }, votos, null, estado);
t("reporte con 3 confirmaciones da 16 puntos", pa === 16);
t("16 puntos = nivel Vecino", B.nivelDe(pa).nombre === "Vecino");
t("reporte descartado resta 5 (16 + 2 − 5 = 13)", B.puntosDe("a", reportes, votos, null, estado) === 13);
t("verificado por la autoridad da 20", B.puntosDe("z", reportes, votos, null, estado) === 20);
t("0 puntos = Nuevo, 400 = Centinela", B.nivelDe(0).nombre === "Nuevo" && B.nivelDe(400).nombre === "Centinela de la quebrada");

console.log(`\nFIN ${ok} OK, ${mal} fallas`);
process.exit(mal ? 1 : 0);
