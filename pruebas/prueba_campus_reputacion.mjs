// Prueba en Node del bloque "CAMPUS Y REPUTACIÓN" de app.js (no necesita emuladores): node prueba_campus_reputacion.mjs
import fs from "fs";
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const ini = app.indexOf("/* === CAMPUS Y REPUTACIÓN (inicio)"), fin = app.indexOf("/* === CAMPUS Y REPUTACIÓN (fin) === */");
if (ini < 0 || fin < 0) throw new Error("No se encontró el bloque CAMPUS Y REPUTACIÓN en app.js");
const B = new Function("VOTOS_MIN", app.slice(ini, fin) + "\nreturn { dentroDelCampus, CAMPUS_UNT, CAMPUS_BBOX, contarVotos, mezclarVotos, MEDALLAS, medallaDe, siguienteMedalla, reporteVerificado, pruebaVerificado };")(3);
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
// Medallas: 5 niveles por reportes verificados (5, 20, 50, 100, 150)
t("4 verificados: todavía sin medalla", B.medallaDe(4) === null && B.siguienteMedalla(4).min === 5);
t("5 → nivel 1 gris (Vecino)", B.medallaDe(5).nivel === 1 && B.medallaDe(5).metal === "gris");
t("20 → nivel 2 bronce", B.medallaDe(20).metal === "bronce" && B.medallaDe(49).nivel === 2);
t("50 → plata, 100 → oro", B.medallaDe(50).metal === "plata" && B.medallaDe(100).metal === "oro");
t("150 → nivel 5 dorado, sin siguiente", B.medallaDe(150).metal === "dorado" && B.medallaDe(999).nivel === 5 && B.siguienteMedalla(150) === null);
t("r1 (3 confirmaciones) está verificado; r2 (descartado) no", B.reporteVerificado(reportes.r1) && !B.reporteVerificado(reportes.r2));
t("verificado por la autoridad sin votos", B.reporteVerificado(reportes.r3) && JSON.stringify(B.pruebaVerificado(reportes.r3, null)) === "{}");
const pr = B.pruebaVerificado(reportes.r1, votos.r1);
t("la prueba trae 3 votantes distintos que confirmaron", pr && new Set([pr.a, pr.b, pr.c]).size === 3 && [pr.a, pr.b, pr.c].every((u) => votos.r1[u].v === 1));
t("sin prueba si el autor se confirmó a sí mismo", B.pruebaVerificado({ autor: "b", confirmaciones: 3, negaciones: 0 }, votos.r1) === null);
t("sin prueba si no está verificado", B.pruebaVerificado(reportes.r2, votos.r2) === null);

console.log(`\nFIN ${ok} OK, ${mal} fallas`);
process.exit(mal ? 1 : 0);
