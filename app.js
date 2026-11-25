/* =====================================================================
   PREVIUNT – Alerta temprana quebrada San Ildefonso (Trujillo, Perú)
   PWA estática · JavaScript vanilla · Leaflet + OpenStreetMap · Open-Meteo
   ===================================================================== */

/* ╔═══════════════════════════════════════════════════════════════════╗
   ║                    FIREBASE_CONFIG  (PEGAR AQUÍ)                  ║
   ║ Firebase console → Configuración del proyecto → Tus apps → Web.   ║
   ║ Copia el objeto firebaseConfig completo. databaseURL es OBLIGATORIO║
   ║ (la misma URL que usan los ESP32, sin "/" al final).               ║
   ║ Si lo dejas vacío, la app funciona en MODO LOCAL (localStorage).   ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCz2TdIRYaPqdIgNW1I-mwOCFFwSzICORI",
  authDomain: "previunt.firebaseapp.com",
  databaseURL: "https://previunt-default-rtdb.firebaseio.com",
  projectId: "previunt",
  storageBucket: "previunt.firebasestorage.app",
  messagingSenderId: "545446959528",
  appId: "1:545446959528:web:9766edfa176b244b66a59d"
};
/* ═════════════════════════ FIN FIREBASE_CONFIG ═════════════════════ */

const FIREBASE_SDK = "10.12.2";

/* ---------------------------------------------------------------------
   CONSTANTES
--------------------------------------------------------------------- */
const TRUJILLO = { lat: -8.11, lng: -79.03, nombre: "Trujillo centro" };

const REPORTE_CADUCA_MS = 6 * 60 * 60 * 1000; // 6 h sin nuevas confirmaciones
const VOTOS_MIN = 3;
const RADIO_ALERTA_HUAICO_M = 1000;
const TRAMO_MAX_M = 2000;
const RADIO_CERCANOS_M = 1000;
/* Mapa base más limpio (CARTO Voyager). Clave gratuita, sin cuenta: https://carto.com/basemaps/apikey
   (uso no comercial gratis hasta 5 millones de teselas al mes; hay que mantener visible "© OpenStreetMap, © CARTO").
   Vacía = se usa OpenStreetMap estándar. */
const CARTO_KEY = "cb1_5fmm_1_22186419f51462a8001d1885";               // Inicio solo muestra reportes a menos de 1 km                    // un tramo reportado no puede medir más de 2 km
/* Modo cercanía (se activa en el centro de control; apagado por defecto para la demo) */
const RADIO_REPORTE_M = 500;                 // solo se puede reportar a menos de 500 m de donde estás
const RADIO_VOTO_M = 1000;                   // solo validan quienes están a menos de 1 km del reporte
const proximidadActiva = () => !!(S.demo && S.demo.proximidad);          // un huaico confirmado a menos de 1 km sube la alerta del usuario

// Sistema de colores normado (igual en toda la app)
/* El estado NO viene de un sensor: lo publica la autoridad (Defensa Civil, COER La Libertad, municipalidad)
   desde el Panel de autoridad, citando su fuente (aviso SENAMHI, parte del COER, inspección en campo).
   El nivel 2 (huaico) solo lo producen los reportes vecinales confirmados.
   Se guarda en /quebrada_san_ildefonso/nivel (0-3), que es lo que lee la sirena física. */
const NIVELES = [
  {
    n: 0, estado: "SECA", corto: "Seco", color: "#2E7D32", titulo: "Seco", icono: "circle-check",
    mensaje: "Sin avisos ni reportes de activación.",
    acciones: ["Ten lista tu mochila de emergencia", "Conoce tu ruta a zona alta", "No arrojes basura al cauce"]
  },
  {
    n: 1, estado: "EN AUMENTO", corto: "En aumento", color: "#F9A825", titulo: "En aumento", icono: "arrow-up",
    mensaje: "Lluvias y caudal en aumento. Prepárate.",
    acciones: ["Prepara tu mochila", "Ubica a tu familia y tu ruta a zona alta", "Aléjate del cauce"]
  },
  {
    n: 2, estado: "HUAICO", corto: "Huaico", color: "#EF6C00", titulo: "Huaico reportado", icono: "triangle-alert",
    mensaje: "Vecinos confirmaron un huaico cerca. Prepárate para evacuar.",
    acciones: ["Prepárate para evacuar", "Ubica a tu familia", "No cruces agua ni lodo"]
  },
  {
    n: 3, estado: "DESBORDE", corto: "Desborde", color: "#C62828", titulo: "Desborde", icono: "siren",
    mensaje: "Confirmado por la autoridad. Evacúa ahora a zona alta.",
    acciones: ["Evacúa ahora a zona alta", "Si no puedes salir, sube al piso más alto", "No cruces agua ni lodo"]
  }
];
// Estados que puede publicar la autoridad (el huaico lo marcan los vecinos)
const NIVELES_AUTORIDAD = [0, 1, 3];

/* Trazado REFERENCIAL del cauce de San Ildefonso (aguas arriba → mar).
   Basado en descripciones de INGEMMET (dique de Las Canteras, ~4 km aguas arriba de El Porvenir), ANA (mapa de rutas de
   evacuación 2015: calles Hipólito Unanue, Tomás Moscoso, Las Ánimas) y prensa (Mampuesto, av. 9 de Octubre, centro, Víctor Larco).
   TODO: verificar con fuente oficial el trazado exacto (ANA / Municipalidad Provincial de Trujillo – plan "Ruta del Agua"). */
const CAUCE_REFERENCIAL = [
  [-8.0560, -78.9620],
  [-8.0650, -78.9780],
  [-8.0740, -78.9930],
  [-8.0820, -79.0080],
  [-8.0920, -79.0180],
  [-8.1030, -79.0250],
  [-8.1120, -79.0300],
  [-8.1230, -79.0360],
  [-8.1340, -79.0440],
  [-8.1430, -79.0530]
];

/* Zonas de huaico / sirena (REFERENCIALES, círculos aproximados por distrito).
   Distritos afectados en 2017 según INGEMMET: El Porvenir, Florencia de Mora, Trujillo y Víctor Larco.
   TODO: verificar con fuente oficial (COER La Libertad / Defensa Civil) los límites reales. */
const ZONAS_SIRENA = [
  { id: "porvenir",  nombre: "El Porvenir",       centro: [-8.0760, -79.0010], radio: 1100 },
  { id: "florencia", nombre: "Florencia de Mora", centro: [-8.0810, -79.0220], radio: 700 },
  { id: "centro",    nombre: "Trujillo centro",   centro: [-8.1116, -79.0288], radio: 900 },
  { id: "larco",     nombre: "Víctor Larco",      centro: [-8.1360, -79.0450], radio: 1000 }
];

/* Puntos seguros con coordenadas. Vacío a propósito: NO inventar.
   El mapa oficial de la ANA (set. 2015) marca zonas seguras en El Porvenir (ver ZONAS_ANA_2015), pero el
   Estadio Municipal de El Porvenir se inundó con la quebrada en marzo de 2023 (Canal N), así que no se publica como seguro.
   TODO: verificar con fuente oficial (Defensa Civil de El Porvenir / COER La Libertad) y agregar con este formato:
   { nombre: "…", lat: -8.0, lng: -79.0, fuente: "…" } */
const PUNTOS_SEGUROS = [];
const MAPA_ANA_2015 = "https://sigrid.cenepred.gob.pe/sigridv3/documento/311/descargar";
const ZONAS_ANA_2015 = [
  { nombre: "Estadio Municipal El Porvenir (1.2 ha)", alerta: "Se inundó con la quebrada en marzo de 2023: no usar sin confirmar con Defensa Civil.", fuenteAlerta: "https://canaln.pe/peru/trujillo-estadio-porvenir-continua-inundado-deslizamientos-quebrada-san-idelfonso-n459893" },
  { nombre: "Parque y losa deportiva (0.3 ha)" },
  { nombre: "Zona de parque (1.6 ha)" },
  { nombre: "Terreno baldío (0.1 ha)" }
];

const TIPOS_REPORTE = {
  bloqueo:    { nombre: "Calle bloqueada",     icono: "construction", color: "#B71C1C" },
  inundacion: { nombre: "Inundación",          icono: "waves",        color: "#00838F" },
  huaico:     { nombre: "Huaico o lodo",       icono: "mountain",     color: "#6D4C41" },
  afectados:  { nombre: "Vivienda afectada",   icono: "house-ic",     color: "#AD1457" },
  otro:       { nombre: "Otro",                icono: "circle-alert", color: "#455A64" }
};

/* Números de emergencia – verificados en gob.pe/547 (Defensa Civil 115, Bomberos 116, SAMU)
   y El Peruano (Policía 105, SAMU 106, Bomberos 116), consultados el 24/11/2026. */
const NUMEROS_EMERGENCIA = [
  { nombre: "Defensa Civil (INDECI)", numero: "115" },
  { nombre: "Bomberos",               numero: "116" },
  { nombre: "SAMU (ambulancia)",      numero: "106" },
  { nombre: "Policía Nacional",       numero: "105" },
  { nombre: "Municipalidad de Trujillo", numero: "044484240", mostrar: "(044) 484240" }
  // Central de la MPT: Plan de Contingencia ante Lluvias Intensas, Región La Libertad 2025-2026 (Anexo 5).
  // TODO: verificar con fuente oficial el teléfono público del COER La Libertad (no figura en el directorio del plan regional).
];

/* Mochila para emergencias – "Combo de Supervivencia" de INDECI (cartilla OGRD del Congreso, 2025).
   Máximo 8 kg; una mochila por cada dos personas. */
const MOCHILA = [
  { corto: "Agua", icono: "glass-water", color: "#1E88E5", detalle: "1 litro de agua por persona" },
  { corto: "Comida", icono: "sandwich", color: "#EF8F00", detalle: "Alimentos no perecibles: enlatados, barras energéticas, galletas, frutos secos" },
  { corto: "Botiquín", icono: "briefcase-medical", color: "#D32F2F", detalle: "Alcohol, gasas, vendas, curitas, mascarillas, guantes y tus medicinas" },
  { corto: "Higiene", icono: "soap", color: "#00897B", detalle: "Gel antibacterial, papel higiénico, toallas higiénicas, paños húmedos, jabón" },
  { corto: "Ropa y manta", icono: "shirt", color: "#6D4C41", detalle: "Una manta y una muda de ropa" },
  { corto: "Radio y linterna", icono: "flashlight", color: "#F9A825", detalle: "Radio a pilas, linterna y pilas de repuesto" },
  { corto: "Silbato", icono: "whistle", color: "#5E35B1", detalle: "Silbato para pedir ayuda" },
  { corto: "Cargador", icono: "battery-charging", color: "#2E7D32", detalle: "Cargador portátil para el celular" },
  { corto: "Dinero", icono: "banknote", color: "#388E3C", detalle: "Dinero en efectivo, de preferencia monedas" },
  { corto: "Documentos", icono: "id-card", color: "#1565C0", detalle: "Copias del DNI y documentos de la casa en bolsa plástica" },
  { corto: "Plan familiar", icono: "map", color: "#00838F", detalle: "Mapa de tu zona segura, punto de reunión y plan familiar de emergencia" },
  { corto: "Teléfonos", icono: "notebook-pen", color: "#455A64", detalle: "Directorio de teléfonos de emergencia y un lapicero" },
  { corto: "Llaves", icono: "key-round", color: "#8D6E63", detalle: "Llaves de repuesto de la casa, auto o moto" },
  { corto: "Bolsas y soga", icono: "package", color: "#795548", detalle: "Bolsas plásticas, cinta adhesiva, soga y guantes de trabajo" }
];
const FUENTE_MOCHILA = "https://www.congreso.gob.pe/Docs/riesgodesastres/files/ogrd-combo-superviviencia_2025.pdf";
const FUENTE_GUIA = "https://www.congreso.gob.pe/Docs/riesgodesastres/files/ogrd-huaicos-aluviones_2025.pdf";

/* Antes / durante / después ante huaicos – cartilla OGRD del Congreso (2025), alineada con INDECI. */
const GUIA_NIVELES = {
  0: { antes: [
    "Infórmate de las zonas que ya fueron afectadas por huaicos (2017 y 2023)",
    "Ubica zonas seguras, rutas de evacuación y puntos de reunión alejados de la quebrada",
    "Ten listo tu Combo de Supervivencia (mochila y caja de reserva)",
    "Participa en los simulacros de tu barrio"
  ] },
  1: { durante: [
    "Sigue solo información oficial: COER, Defensa Civil, SENAMHI",
    "Atiende las señales: agua turbia, subida repentina del caudal o un ruido fuerte que se acerca",
    "Ten la mochila cerca de la puerta",
    "Ten listos a niños, adultos mayores, personas con discapacidad y mascotas"
  ] },
  2: { durante: [
    "Prepárate para evacuar hacia tu punto de reunión",
    "Si ves el huaico, confírmalo en el mapa para avisar a tus vecinos",
    "Ten listos a niños, adultos mayores, personas con discapacidad y mascotas",
    "No cruces el cauce de la quebrada"
  ] },
  3: {
    durante: [
      "Evacúa de inmediato hacia el punto de reunión, alejándote del cauce",
      "Si no puedes salir, sube a la parte más alta de tu vivienda",
      "No cruces cauces ni corrientes de lodo",
      "No te detengas a grabar ni a tomar fotos"
    ],
    despues: [
      "Llama a los números de emergencia si hay heridos o atrapados",
      "No regreses a la zona afectada hasta que lo indiquen las autoridades",
      "Revisa agua, desagüe, luz y gas antes de usarlos",
      "No consumas agua ni alimentos que tocaron el lodo",
      "Atento a infecciones estomacales, de piel o por zancudos y roedores"
    ]
  }
};

/* Línea de tiempo histórica – cada hecho con fuente. */
const HISTORIA = [
  {
    fecha: "1998", titulo: "El Niño 1997–98: desborde y Mampuesto",
    texto: "Durante El Niño 1997–98 el desborde de la quebrada arrancó ataúdes del cementerio de Mampuesto. Vecinos presentaron en febrero de 1998 una queja a la Defensoría del Pueblo por la calidad de las obras de prevención en el cauce (sector Río Seco).",
    fuentes: [
      { t: "La República", u: "https://larepublica.pe/sociedad/857395-huaicos-en-el-peru-desborde-de-quebrada-san-idelfonso-arraso-con-cementerio-mampuesto-en-trujillo-video" },
      { t: "Defensoría del Pueblo (SINIA)", u: "https://sinia.minam.gob.pe/sites/default/files/sinia/archivos/public/docs/461.pdf" }
    ]
  },
  {
    fecha: "15 – 22 mar. 2017", titulo: "Niño Costero: siete huaicos",
    texto: "Las lluvias del Niño Costero rompieron el dique del sector Las Canteras, unos 4 km aguas arriba de El Porvenir, y la quebrada descargó siete huaicos que llegaron a zonas urbanas de El Porvenir, Florencia de Mora, Trujillo y Víctor Larco.",
    fuentes: [
      { t: "INGEMMET", u: "https://app.ingemmet.gob.pe/biblioteca/pdf/Repo-1937-31.pdf" },
      { t: "Diario Correo", u: "https://diariocorreo.pe/edicion/la-libertad/la-libertad-lluvias-causan-alarma-en-la-poblacion-peru-trujillo-noticia/" }
    ]
  },
  {
    fecha: "10 mar. 2023", titulo: "Nueva activación tras lluvia intensa",
    texto: "Una lluvia de más de seis horas activó la quebrada; Mampuesto (El Porvenir) fue el primer punto de desborde y gran parte de la ciudad amaneció con agua y lodo. El alcalde provincial informó 100 damnificados en El Porvenir.",
    fuentes: [
      { t: "Andina", u: "https://andina.pe/agencia/noticia-trujillo-amanece-inundado-tras-activacion-quebradas-leon-san-idelfonso-y-san-carlos-932289.aspx" },
      { t: "Andina (damnificados)", u: "https://andina.pe/agencia/noticia-trujillo-100-damnificados-y-numerosos-afectados-activacion-quebrada-el-porvenir-932393.aspx" }
    ]
  },
  {
    fecha: "2025 – 2026", titulo: "Sigue siendo zona crítica",
    texto: "El plan regional de contingencia ante lluvias intensas registra a El Porvenir – San Idelfonso con 200 viviendas y 2 330 personas en riesgo, y a la quebrada como zona crítica por flujo de detritos y lodo (INGEMMET, 2023).",
    fuentes: [
      { t: "Gob. Regional La Libertad", u: "https://cdn.www.gob.pe/uploads/document/file/7442373/6339567-plan-deanexo-rer-n-699-2024-contingencias-ante-lluvias-intensas-region-la-libertad-2025-2026-visado-finalf.pdf" }
    ]
  }
];

/* ---------------------------------------------------------------------
   UTILIDADES
--------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
// Icono del sprite Lucide incrustado en index.html
const ic = (nombre, clase = "") => `<svg class="ic ${clase}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = (ts) => ts ? new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" }) : "--:--";
const fechaHora = (ts) => ts ? new Date(ts).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" }) : "—";
const hace = (ts) => {
  const s = Math.max(0, Math.round((ahora() - ts) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); return `hace ${h} h`;
};
const nivelValido = (n) => Number.isInteger(n) && n >= 0 && n <= 3;
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn("localStorage", e); return false; } };
const idAleatorio = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// Distancia en metros (aprox. equirectangular, suficiente a escala de ciudad)
function distM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = (b[0] - a[0]) * rad;
  return Math.sqrt(x * x + y * y) * R;
}

/* Tramos de calle: Firebase puede devolver arreglos como objetos {0:…,1:…}; se normalizan aquí. */
function trazoDe(r) {
  if (!r || r.forma !== "tramo" || !r.trazo) return null;
  const pts = (Array.isArray(r.trazo) ? r.trazo : Object.values(r.trazo))
    .map((p) => (Array.isArray(p) ? p : Object.values(p || {})).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  return pts.length >= 2 ? pts : null;
}
/* Distancia de un punto al reporte: al punto, o al vértice más cercano del tramo */
function distAReporte(p, r) {
  const t = trazoDe(r);
  if (t) return Math.min(...t.map((q) => distM(p, q)));
  return distM(p, [r.lat, r.lng]);
}

/* ---------------------------------------------------------------------
   CAPA DE DATOS  (Firebase si hay config · localStorage si no)
--------------------------------------------------------------------- */
const firebaseConfigurado = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
let serverOffset = 0; // corrección del reloj con el del servidor de Firebase
const ahora = () => Math.round(Date.now() + serverOffset);

const Datos = {
  modo: "local",
  uid: null,
  _subs: {},

  async init() {
    if (firebaseConfigurado()) {
      try {
        await this._initFirebase();
        this.modo = "firebase";
        return;
      } catch (e) {
        console.error("Firebase no disponible:", e);
        toast("No se pudo conectar a Firebase. Funcionando en modo local.");
      }
    }
    this._initLocal();
  },

  /* ---------- Modo LOCAL ---------- */
  _initLocal() {
    this.modo = "local";
    this.uid = lsGet("previunt_uid", null) || idAleatorio();
    lsSet("previunt_uid", this.uid);
    const claves = { previunt_demo: "demo", previunt_reportes: "reportes", previunt_historial: "historial" };
    // Sincroniza entre pestañas del mismo navegador (útil para la demo)
    window.addEventListener("storage", (e) => { if (claves[e.key]) this._emitLocal(claves[e.key]); });
  },
  _leerLocal(canal) {
    if (canal === "sensor") return lsGet("previunt_sensor", null); // estado oficial publicado en este navegador
    if (canal === "demo") return lsGet("previunt_demo", { activo: false, nivel: 0 });
    if (canal === "reportes") return lsGet("previunt_reportes", {});
    if (canal === "historial") return lsGet("previunt_historial", {});
  },
  _emitLocal(canal) { (this._subs[canal] || []).forEach((cb) => cb(this._leerLocal(canal))); },
  _subLocal(canal, cb) {
    (this._subs[canal] = this._subs[canal] || []).push(cb);
    cb(this._leerLocal(canal));
  },

  /* ---------- Modo FIREBASE ---------- */
  async _initFirebase() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
    const [appM, authM, dbM] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-database.js`)
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    this.db = dbM.getDatabase(app);
    this.fb = dbM;
    try {
      const auth = authM.getAuth(app);
      const cred = await authM.signInAnonymously(auth);
      this.uid = cred.user.uid;
    } catch (e) {
      console.warn("Auth anónima falló (¿está habilitada en Firebase?)", e);
      this.uid = lsGet("previunt_uid", null) || idAleatorio();
      lsSet("previunt_uid", this.uid);
      toast("Aviso: activa 'Anónimo' en Firebase Authentication.");
    }
    dbM.onValue(dbM.ref(this.db, ".info/serverTimeOffset"), (s) => { serverOffset = s.val() || 0; });
    this._rutas = { sensor: "quebrada_san_ildefonso", demo: "demo", reportes: "reportes", historial: "historial_nivel" };
  },

  /* ---------- API común ---------- */
  suscribir(canal, cb) {
    if (this.modo === "local") return this._subLocal(canal, cb);
    const { onValue, ref } = this.fb;
    let r = ref(this.db, this._rutas[canal]);
    if (canal === "historial") r = this.fb.query(r, this.fb.orderByChild("fecha"), this.fb.limitToLast(50));
    onValue(r, (s) => cb(s.val()), (err) => { console.error(canal, err); cb(canal === "reportes" || canal === "historial" ? {} : null); });
  },

  async publicarEstado(nivel, fuente) {
    // Mismo nodo y mismo campo "nivel" que lee la sirena física (ESP32)
    const valor = { nivel, estado: NIVELES[nivel].estado, actualizado: ahora(), origen: "autoridad", fuente, autor: this.uid };
    if (this.modo === "local") { lsSet("previunt_sensor", valor); this._emitLocal("sensor"); return; }
    await this.fb.set(this.fb.ref(this.db, "quebrada_san_ildefonso"), valor);
  },

  async setDemo(activo, nivel, fuente = "") {
    const valor = { activo, nivel: nivelValido(nivel) ? nivel : 0, actualizado: ahora(), fuente };
    if (this.modo === "local") { lsSet("previunt_demo", { ...lsGet("previunt_demo", {}), ...valor }); this._emitLocal("demo"); return; }
    await this.fb.update(this.fb.ref(this.db, "demo"), valor);
  },

  async setProximidad(on) {
    if (this.modo === "local") { lsSet("previunt_demo", { ...lsGet("previunt_demo", { activo: false, nivel: 0 }), proximidad: !!on }); this._emitLocal("demo"); return; }
    await this.fb.update(this.fb.ref(this.db, "demo"), { proximidad: !!on });
  },

  async addHistorial(id, entrada) {
    if (this.modo === "local") {
      const h = lsGet("previunt_historial", {});
      h[id] = entrada;
      const ids = Object.keys(h).sort((a, b) => h[a].fecha - h[b].fecha);
      while (ids.length > 100) delete h[ids.shift()];
      lsSet("previunt_historial", h); this._emitLocal("historial"); return;
    }
    // id determinístico: si varios celulares detectan el mismo cambio, se escribe una sola vez
    await this.fb.set(this.fb.ref(this.db, `historial_nivel/${id}`), entrada);
  },

  async addReporte(r) {
    const rep = { ...r, autor: this.uid, creado: ahora(), confirmaciones: 0, negaciones: 0, verificadoAutoridad: false };
    if (this.modo === "local") {
      const todos = lsGet("previunt_reportes", {});
      const id = idAleatorio();
      todos[id] = rep;
      if (!lsSet("previunt_reportes", todos)) throw new Error("Memoria del navegador llena (fotos). Borra reportes antiguos.");
      this._emitLocal("reportes"); return id;
    }
    // La foto va en /fotos/{id} (aparte) para que abrir la app no descargue todas las fotos;
    // cada foto se baja solo cuando alguien abre ese reporte.
    const key = this.fb.push(this.fb.ref(this.db, "reportes")).key;
    const foto = rep.foto;
    rep.foto = null;
    rep.tieneFoto = !!foto;
    const cambios = { [`reportes/${key}`]: rep };
    if (foto) cambios[`fotos/${key}`] = foto;
    try {
      await this.fb.update(this.fb.ref(this.db), cambios);
    } catch (e) {
      // Si las reglas de /fotos aún no están publicadas, se guarda la foto dentro del reporte (no se pierde)
      if (!foto) throw e;
      console.warn("No se pudo usar /fotos, se guarda dentro del reporte:", e);
      await this.fb.set(this.fb.ref(this.db, `reportes/${key}`), { ...rep, foto, tieneFoto: false });
    }
    return key;
  },

  /* voto: 1 = "Sigue ahí", -1 = "Ya no está". uidVoto permite votos SIMULADOS desde el centro de control. */
  async votar(id, voto, uidVoto = this.uid) {
    const aplicar = (r) => {
      if (!r) return r;
      if (r.autor === uidVoto) return; // no votar el propio reporte
      r.votos = r.votos || {};
      if (r.votos[uidVoto]) return;    // no votar dos veces
      r.votos[uidVoto] = voto;
      if (voto === 1) { r.confirmaciones = (r.confirmaciones || 0) + 1; r.ultimaConfirmacion = ahora(); }
      else r.negaciones = (r.negaciones || 0) + 1;
      return r;
    };
    if (this.modo === "local") {
      const todos = lsGet("previunt_reportes", {});
      const res = aplicar(todos[id]);
      if (!res) return false;
      todos[id] = res; lsSet("previunt_reportes", todos); this._emitLocal("reportes"); return true;
    }
    const tx = await this.fb.runTransaction(this.fb.ref(this.db, `reportes/${id}`), aplicar);
    return tx.committed;
  },

  _fotos: new Map(),
  async getFoto(id, r) {
    if (r && r.foto) return r.foto;                 // modo local o reportes antiguos
    if (this.modo !== "firebase" || !r || !r.tieneFoto) return null;
    if (this._fotos.has(id)) return this._fotos.get(id);
    const snap = await this.fb.get(this.fb.ref(this.db, `fotos/${id}`));
    const v = snap.val();
    this._fotos.set(id, v);
    return v;
  },

  async actualizarReporte(id, cambios) {
    if (this.modo === "local") {
      const todos = lsGet("previunt_reportes", {});
      if (!todos[id]) return;
      todos[id] = { ...todos[id], ...cambios }; lsSet("previunt_reportes", todos); this._emitLocal("reportes"); return;
    }
    await this.fb.update(this.fb.ref(this.db, `reportes/${id}`), cambios);
  },

  async borrarReporte(id) {
    if (this.modo === "local") {
      const todos = lsGet("previunt_reportes", {}); delete todos[id];
      lsSet("previunt_reportes", todos); this._emitLocal("reportes"); return;
    }
    await this.fb.update(this.fb.ref(this.db), { [`reportes/${id}`]: null, [`fotos/${id}`]: null });
  }
};

/* ---------------------------------------------------------------------
   ESTADO GLOBAL
--------------------------------------------------------------------- */
const S = {
  sensor: null,
  demo: { activo: false, nivel: 0 },
  reportes: {},
  historial: {},
  ubicacion: null,          // { lat, lng, precision }
  nivelPrevio: undefined,
  nivelBasePrevio: undefined
};

/* Nivel de la quebrada (sensor o demo). Es el que colorea el cauce y las zonas de sirena. */
function estadoBase() {
  // El nivel 2 (huaico) solo sale de reportes vecinales: un 2 guardado por la versión anterior se lee como "En aumento"
  const oficial = (n) => (n === 2 ? 1 : n);
  if (S.demo && S.demo.activo && nivelValido(Number(S.demo.nivel))) {
    return { nivel: oficial(Number(S.demo.nivel)), fuente: "demo", ts: S.demo.actualizado, cita: S.demo.fuente || "" };
  }
  const s = S.sensor;
  if (!s || !nivelValido(Number(s.nivel))) return { nivel: 0, fuente: "sinReportes" };
  return { nivel: oficial(Number(s.nivel)), fuente: "autoridad", ts: Number(s.actualizado) || 0, cita: s.fuente || "" };
}

/* Alerta por reportes de huaico cerca del usuario (o en cualquier zona si no compartió su ubicación):
   - verificado por la autoridad  → rojo (emergencia)
   - confirmado por ≥ 3 vecinos   → naranja (prepárate)
   Los reportes caducados o descartados no cuentan. */
function alertaPorReportes() {
  const p = S.ubicacion ? [S.ubicacion.lat, S.ubicacion.lng] : null;
  let mejor = null;
  for (const [id, r] of Object.entries(S.reportes || {})) {
    if (!r || r.tipo !== "huaico" || typeof r.lat !== "number") continue;
    if (estadoReporte(r) !== "confirmado") continue;
    const dist = p ? distAReporte(p, r) : null;
    if (dist !== null && dist > RADIO_ALERTA_HUAICO_M) continue;
    const nivel = r.verificadoAutoridad ? 3 : ((r.confirmaciones || 0) >= VOTOS_MIN ? 2 : null);
    if (nivel !== null && (!mejor || nivel > mejor.nivel)) mejor = { nivel, id, r, dist };
  }
  return mejor;
}

/* Nivel efectivo que muestra la app: el mayor entre la quebrada y la alerta por reportes */
function estadoEfectivo() {
  const b = estadoBase();
  const a = alertaPorReportes();
  if (a && (b.nivel === null || a.nivel > b.nivel)) {
    return {
      nivel: a.nivel, fuente: a.nivel === 3 ? "reporteAutoridad" : "reporteVecinos",
      ts: Math.max(a.r.verificadoEn || 0, a.r.ultimaConfirmacion || 0, a.r.creado || 0),
      reporteId: a.id, reporte: a.r, dist: a.dist, base: b
    };
  }
  return b;
}
const esPorReporte = (e) => e.fuente === "reporteAutoridad" || e.fuente === "reporteVecinos";

/* ---------------------------------------------------------------------
   SIRENA (Web Audio API, sin archivos externos)
--------------------------------------------------------------------- */
const Sirena = {
  ctx: null, nodos: null, activa: false, silenciada: false,
  desbloquear() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) { console.warn("Audio no disponible", e); }
    if (this.activa && !this.silenciada) this._sonar();
    actualizarBotonesSirena();
  },
  iniciar() {
    this.activa = true; this.silenciada = false;
    if (navigator.vibrate) navigator.vibrate([600, 250, 600, 250, 600]);
    this._sonar(); actualizarBotonesSirena();
  },
  detener() { this.activa = false; this._parar(); actualizarBotonesSirena(); },
  silenciar() { this.silenciada = true; this._parar(); actualizarBotonesSirena(); },
  puedeSonar() { return !!(this.ctx && this.ctx.state === "running"); },
  _sonar() {
    if (!this.puedeSonar() || this.nodos) return;
    const c = this.ctx;
    const osc = c.createOscillator(); osc.type = "square"; osc.frequency.value = 850;
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.6; // barrido sube-baja
    const lfoGain = c.createGain(); lfoGain.gain.value = 350;
    const vol = c.createGain(); vol.gain.value = 0.08;
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(vol).connect(c.destination);
    osc.start(); lfo.start();
    this.nodos = { osc, lfo, vol };
  },
  _parar() {
    if (!this.nodos) return;
    try { this.nodos.osc.stop(); this.nodos.lfo.stop(); } catch {}
    this.nodos = null;
  },
  async prueba(ms = 3000) {
    this.desbloquear();
    const estaba = this.activa;
    this.activa = true; this.silenciada = false; this._sonar();
    setTimeout(() => { if (!estaba) { this.activa = false; this._parar(); } actualizarBotonesSirena(); }, ms);
  }
};
function actualizarBotonesSirena() {
  const enRojo = estadoEfectivo().nivel === 3;
  $("#btnSonidoSirena").hidden = !(enRojo && !Sirena.silenciada && !Sirena.puedeSonar());
  $("#btnSilenciar").hidden = !(enRojo && !Sirena.silenciada && Sirena.puedeSonar());
}
// Los navegadores solo permiten audio después de un toque del usuario
document.addEventListener("pointerdown", () => Sirena.desbloquear(), { passive: true });

/* ---------------------------------------------------------------------
   NOTIFICACIONES (pocas y útiles)
--------------------------------------------------------------------- */
function afectaMiZona() {
  if (!S.ubicacion) return true; // sin ubicación: avisar (mejor prevenir)
  const p = [S.ubicacion.lat, S.ubicacion.lng];
  return ZONAS_SIRENA.some((z) => distM(p, z.centro) <= z.radio + 1500);
}
async function notificar(nivel) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const N = NIVELES[nivel];
  const titulo = nivel === 3 ? "Desborde: evacúa ahora" : nivel === 1 ? "Quebrada San Ildefonso en aumento" : "Alerta: quebrada San Ildefonso";
  const opts = { body: N.mensaje, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "nivel-quebrada", renotify: true, requireInteraction: nivel === 3, vibrate: nivel === 3 ? [600, 250, 600] : [300] };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titulo, opts); else new Notification(titulo, opts);
  } catch (e) { try { new Notification(titulo, opts); } catch {} }
}
/* Solo al SUBIR a naranja o rojo, una vez por cambio de nivel */
function gestionarNotificacion(n) {
  if (n === null) return;
  let ult = lsGet("previunt_ultimoNotificado", 0);
  if (n < 1) { lsSet("previunt_ultimoNotificado", n); return; }
  if (n > ult && afectaMiZona()) { notificar(n); lsSet("previunt_ultimoNotificado", n); }
  else if (n < ult) lsSet("previunt_ultimoNotificado", n);
}
function prepararBotonNotif() {
  const fila = $("#filaNotif");
  if (!("Notification" in window) || Notification.permission !== "default") { fila.hidden = true; return; }
  fila.hidden = false;
  $("#btnNotif").onclick = async () => {
    const p = await Notification.requestPermission();
    fila.hidden = true;
    toast(p === "granted" ? "Listo: te avisaremos solo en naranja o rojo." : "Avisos desactivados. Puedes cambiarlo en el navegador.");
  };
}

/* ---------------------------------------------------------------------
   ALARMA (pop-up de emergencia)
--------------------------------------------------------------------- */
function abrirAlarma() {
  $("#alarma").hidden = false;
  Sirena.desbloquear();          // si el navegador lo permite, suena; si no, aparece "Activar sonido"
  actualizarBotonesSirena();
  setTimeout(() => $("#btnRutaEmergencia").focus(), 50);
}
function cerrarAlarma() { $("#alarma").hidden = true; }

/* ---------------------------------------------------------------------
   INICIO
--------------------------------------------------------------------- */
function renderInicio() {
  const e = estadoEfectivo();
  const card = $("#tarjetaEstado");
  card.className = "estado " + (e.nivel === null ? "nivel-x" : "nivel-" + e.nivel);
  // La regla muestra lo que mide el sensor (o el demo): el nivel de la quebrada, no los reportes
  const nRegla = e.nivel;
  const sinRegla = nRegla === null || nRegla === undefined;
  $("#medidorNivel").dataset.nivel = sinRegla ? "x" : String(nRegla);
  $("#medidorNivel").setAttribute("aria-label", sinRegla ? "Nivel de la quebrada: sin datos" : `Nivel de la quebrada: ${NIVELES[nRegla].corto}`);
  $("#estadoEtiqueta").textContent = "Quebrada San Ildefonso";

  if (e.nivel !== null) {
    const N = NIVELES[e.nivel];
    $("#estadoIcono").innerHTML = ic(N.icono);
    $("#estadoTitulo").textContent = N.titulo;
    $("#estadoMensaje").textContent = N.mensaje;
    $("#estadoMeta").innerHTML = textoFuente(e);
    renderAcciones(N.acciones);
    if (esPorReporte(e)) {
      const donde = e.dist !== null && e.dist !== undefined ? ` a ${Math.round(e.dist / 10) * 10} m` : "";
      $("#estadoEtiqueta").textContent = "Huaico reportado" + donde;
      $("#estadoMensaje").textContent = e.nivel === 3 ? "Verificado por la autoridad. Evacúa a zona alta." : "Confirmado por vecinos. Prepárate.";
      const base = e.base.nivel !== null ? NIVELES[e.base.nivel].corto.toLowerCase() : "sin datos";
      $("#estadoMeta").textContent = `Reporte vecinal · ${hora(e.ts)} · Estado oficial: ${base}`;
    }
  }

  // Emergencia (rojo)
  const rojo = e.nivel === 3;
  document.body.classList.toggle("emergencia", rojo);
  $("#bannerEmergencia").hidden = !rojo;
  if (!rojo) cerrarAlarma();
  if (rojo && esPorReporte(e)) {
    // Huaico verificado: las sirenas de la quebrada NO están activas; no se dice que lo estén
    $("#emergenciaTitulo").textContent = "Huaico: evacúa ahora";
    $("#bannerEmergenciaTitulo").textContent = "Huaico cerca: evacúa";
    const donde = e.dist !== null && e.dist !== undefined ? `a ${Math.round(e.dist / 10) * 10} m de ti` : "en la ciudad";
    $("#listaZonasSirena").innerHTML = `<li>Huaico verificado ${esc(donde)}${e.reporte.descripcion ? ": " + esc(e.reporte.descripcion) : ""}</li>`;
    $("#emergenciaFuente").textContent = `Reporte verificado por la autoridad · ${hora(e.ts)}`;
  } else if (rojo) {
    $("#emergenciaTitulo").textContent = "Desborde: evacúa ahora";
    $("#bannerEmergenciaTitulo").textContent = "Desborde: evacúa ahora";
    $("#listaZonasSirena").innerHTML = `<li>Sirenas activas en ${ZONAS_SIRENA.map((z) => esc(z.nombre)).join(", ").replace(/, ([^,]*)$/, " y $1")}</li>`;
    $("#emergenciaFuente").innerHTML = textoFuente(e);
  }
  actualizarBotonesSirena();
}
/* "Fuente: Parte COER La Libertad · 21:40" (o SIMULADO en la demo). Sin reporte: lo dice. */
function textoFuente(e) {
  if (e.fuente === "sinReportes") return "Sin reportes oficiales registrados";
  const cita = e.cita ? esc(e.cita) : "Autoridad";
  const h = e.ts ? ` · ${hora(e.ts)}` : "";
  return e.fuente === "demo" ? `<span class="tag-sim">SIMULADO</span> ${cita}${h}` : `Fuente: ${cita}${h}`;
}
function renderAcciones(lista) {
  $("#listaAcciones").innerHTML = lista.map((a) => `<li>${esc(a)}</li>`).join("");
}

/* Se ejecuta cada vez que cambia el nivel efectivo */
function alCambiarNivel() {
  const e = estadoEfectivo();
  const n = e.nivel;
  const nb = esPorReporte(e) ? e.base.nivel : n;
  if (nb !== S.nivelBasePrevio) { S.nivelBasePrevio = nb; if (mapa) pintarCauceYZonas(); }
  if (n === S.nivelPrevio) return;
  const previo = S.nivelPrevio;
  S.nivelPrevio = n;
  if (n === 3 && previo !== 3) abrirAlarma();
  if (typeof renderGuia === "function") renderGuia();

  if (n === 3) Sirena.iniciar(); else Sirena.detener();
  // Regla del proyecto: los reportes ciudadanos no generan notificaciones. Sí notifica el sensor, el demo
  // y un huaico verificado por la autoridad.
  gestionarNotificacion(e.fuente === "reporteVecinos" ? e.base.nivel : n);

  if (mapa) pintarCauceYZonas();
}
function ultimoHistorial(origen) {
  const arr = Object.values(S.historial || {}).filter((h) => !origen || h.origen === origen).sort((a, b) => b.fecha - a.fecha);
  return arr[0];
}

/* ---------------------------------------------------------------------
   CLIMA (Open-Meteo, gratis, sin API key)
--------------------------------------------------------------------- */
const CODIGOS_WMO = {
  0: ["sun", "Despejado"], 1: ["cloud-sun", "Poco nublado"], 2: ["cloud-sun", "Parcial"], 3: ["cloud", "Nublado"],
  45: ["cloud-fog", "Niebla"], 48: ["cloud-fog", "Niebla"],
  51: ["cloud-drizzle", "Llovizna"], 53: ["cloud-drizzle", "Llovizna"], 55: ["cloud-drizzle", "Llovizna"], 56: ["cloud-drizzle", "Llovizna"], 57: ["cloud-drizzle", "Llovizna"],
  61: ["cloud-rain", "Lluvia"], 63: ["cloud-rain", "Lluvia"], 65: ["cloud-rain", "Lluvia fuerte"], 66: ["cloud-rain", "Lluvia"], 67: ["cloud-rain", "Lluvia"],
  71: ["snowflake", "Nieve"], 73: ["snowflake", "Nieve"], 75: ["snowflake", "Nieve"], 77: ["snowflake", "Granizo"],
  80: ["cloud-rain", "Chubascos"], 81: ["cloud-rain", "Chubascos"], 82: ["cloud-rain", "Chubascos"],
  95: ["cloud-lightning", "Tormenta"], 96: ["cloud-lightning", "Tormenta"], 99: ["cloud-lightning", "Tormenta"]
};
async function fetchJSON(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function cargarClima() {
  const lat = S.ubicacion ? S.ubicacion.lat.toFixed(3) : TRUJILLO.lat;
  const lng = S.ubicacion ? S.ubicacion.lng.toFixed(3) : TRUJILLO.lng;
  $("#climaLugar").textContent = S.ubicacion ? `Tu ubicación (${lat}, ${lng})` : `${TRUJILLO.nombre} (no compartiste tu ubicación)`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m` +
    `&hourly=precipitation,precipitation_probability&daily=precipitation_sum&timezone=America/Lima&forecast_days=2`;
  try {
    const d = await fetchJSON(url);
    const c = d.current;
    if (!c || typeof c.temperature_2m !== "number") throw new Error("Respuesta incompleta");
    // Próximas 6 horas desde la hora actual
    const idx = d.hourly.time.findIndex((t) => t >= c.time.slice(0, 13) + ":00");
    const desde = idx < 0 ? 0 : idx;
    const probs = d.hourly.precipitation_probability.slice(desde, desde + 6).filter((v) => v !== null);
    const lluv6 = d.hourly.precipitation.slice(desde, desde + 6).filter((v) => v !== null);
    const probMax = probs.length ? Math.max(...probs) : null;
    const suma6 = lluv6.length ? lluv6.reduce((a, b) => a + b, 0) : null;
    const hoy = d.daily?.precipitation_sum?.[0];
    const [ico, desc] = CODIGOS_WMO[c.weather_code] || ["thermometer", "—"];
    const v = (x, u, dec = 1) => (x === null || x === undefined ? "s/d" : `${Number(x).toFixed(dec)}${u}`);
    $("#climaCuerpo").innerHTML = `
      <div class="clima-dato">${ic(ico)}<span class="v">${v(c.temperature_2m, "°", 0)}</span><span class="k">${esc(desc)}</span></div>
      <div class="clima-dato">${ic("droplets")}<span class="v">${v(c.precipitation, " mm")}</span><span class="k">Lluvia ahora</span></div>
      <div class="clima-dato">${ic("umbrella")}<span class="v">${probMax === null ? "s/d" : probMax + "%"}</span><span class="k">Prob. 6 h</span></div>
      <div class="clima-dato">${ic("cloud-rain")}<span class="v">${v(hoy, " mm")}</span><span class="k">Hoy</span></div>`;
    $("#climaFuente").textContent = `Open-Meteo · ${c.time.slice(11, 16)}`;
  } catch (e) {
    console.warn("Clima:", e);
    $("#climaCuerpo").innerHTML = `<div class="sin-datos">Sin datos disponibles</div>`;
    $("#climaFuente").textContent = `Open-Meteo no respondió · ${hora(Date.now())}`;
  }
}

/* ---------------------------------------------------------------------
   UBICACIÓN
--------------------------------------------------------------------- */
function pedirUbicacion({ silencioso = false } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { if (!silencioso) toast("Tu navegador no permite ubicación."); return resolve(null); }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        S.ubicacion = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        lsSet("previunt_geoOK", true);
        $("#btnUbicacion").textContent = "Actualizar ubicación";
        pintarYo();
        renderListas();
        renderTodo(); // la distancia al huaico reportado depende de la ubicación
        resolve(S.ubicacion);
      },
      (err) => {
        if (!silencioso) toast(err.code === 1 ? "Permiso de ubicación denegado. Usamos Trujillo centro." : "No se pudo obtener tu ubicación.");
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

/* ---------------------------------------------------------------------
   MAPA (Leaflet + OpenStreetMap)
--------------------------------------------------------------------- */
let mapa = null;
const capas = {};
let marcadorTemp = null;
let marcadorYo = null;

function iniciarMapa() {
  if (mapa) return;
  if (!window.L) {
    $("#mapaAviso").hidden = false;
    $("#mapaAviso").textContent = "Mapa no disponible: no se pudo cargar Leaflet (revisa tu conexión a internet).";
    return;
  }
  mapa = L.map("mapa", { zoomControl: true, attributionControl: true, zoomSnap: 0.5 }).setView([-8.100, -79.020], 13);
  if (CARTO_KEY) {
    L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`, {
      maxNativeZoom: 18, maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution/">CARTO</a>'
    }).addTo(mapa);
  } else {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "teselas-osm", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
  }
  // Cauce y zonas de sirena: ocultos por defecto (se muestran con los botones del mapa)
  capas.zonas = L.layerGroup();
  capas.satelite = crearCapaSatelite();
  capas.cauce = L.layerGroup();
  capas.bloqueos = L.layerGroup().addTo(mapa);
  capas.reportes = L.layerGroup().addTo(mapa);
  capas.evac = L.layerGroup().addTo(mapa);
  capas.seguros = L.layerGroup().addTo(mapa);
  PUNTOS_SEGUROS.forEach((p) => L.marker([p.lat, p.lng]).bindPopup(`<strong>${esc(p.nombre)}</strong><br>Punto seguro · ${esc(p.fuente)}`).addTo(capas.seguros));
  pintarCauceYZonas();
  pintarReportes();
  pintarYo();
  // Encuadre inicial: cauce + zonas de sirena
  mapa.fitBounds(L.latLngBounds(CAUCE_REFERENCIAL.concat(ZONAS_SIRENA.map((z) => z.centro))), { padding: [20, 20], animate: false });

  // Fotos: se descargan solo al abrir el reporte
  mapa.on("popupopen", async (ev) => {
    const img = ev.popup.getElement()?.querySelector("img[data-foto-id]");
    if (!img) return;
    const id = img.dataset.fotoId;
    try {
      const f = await Datos.getFoto(id, S.reportes[id]);
      if (f) img.src = f; else img.alt = "Foto no disponible";
    } catch (e) { console.warn("Foto:", e); img.alt = "Foto no disponible"; }
  });
  // Tocar la foto del reporte la abre en grande, centrada
  mapa.on("popupopen", (ev) => {
    const b = ev.popup.getElement()?.querySelector(".popup-mini");
    if (!b) return;
    b.onclick = () => {
      const img = b.querySelector("img");
      if (img.src && img.src.startsWith("data:")) { mapa.closePopup(); abrirVisor(img.src, img.dataset.pie || ""); }
      else toast("La foto aún se está cargando");
    };
  });

  // Votos desde el popup (delegación de eventos)
  mapa.getContainer().addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-voto]");
    if (!b) return;
    ev.preventDefault();
    b.disabled = true;
    if (proximidadActiva()) {
      const u = await pedirUbicacion();
      const r = S.reportes[b.dataset.id];
      if (!u) { toast("Activa tu ubicación para validar este reporte."); b.disabled = false; return; }
      const d = distAReporte([u.lat, u.lng], r);
      if (d > RADIO_VOTO_M + Math.min(u.precision || 0, 100)) {
        toast(`Solo validan quienes están a menos de ${RADIO_VOTO_M / 1000} km. Estás a ~${(d / 1000).toFixed(1)} km.`); return;
      }
    }
    try {
      const ok = await Datos.votar(b.dataset.id, Number(b.dataset.voto));
      toast(ok ? "¡Gracias! Tu validación ayuda a tus vecinos." : "No se pudo registrar el voto.");
      mapa.closePopup();
    } catch (e) { console.error(e); toast("Error al votar. Revisa tu conexión."); b.disabled = false; }
  });
}

function colorNivelActual() {
  const n = estadoBase().nivel;
  return n === null ? "#9E9E9E" : NIVELES[n].color;
}

/* Imagen satelital del día anterior: NASA GIBS, VIIRS (Suomi NPP) color real, 250 m por píxel.
   Sirve para ver nubes y sistemas de lluvia sobre Trujillo; no tiene detalle para ver el cauce.
   Si la imagen no carga, no se muestra nada (no se inventa). */
let fechaSatelite = "";
function crearCapaSatelite() {
  fechaSatelite = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const capa = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${fechaSatelite}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
    maxNativeZoom: 9, maxZoom: 20, opacity: 0.85,
    attribution: `Imagen satelital: NASA GIBS / VIIRS, ${fechaSatelite}`
  });
  let errores = 0, cargadas = 0;
  capa.on("tileload", () => { cargadas++; });
  capa.on("tileerror", () => {
    errores++;
    if (errores >= 2 && cargadas === 0 && mapa?.hasLayer(capa)) {
      capa.remove();
      $('.chip[data-capa="satelite"]')?.setAttribute("aria-pressed", "false");
      toast("Sin imagen satelital disponible para ayer.");
    }
  });
  return capa;
}
function alternarSatelite(on) {
  if (!mapa) return;
  if (on) {
    capas.satelite.addTo(mapa); capas.satelite.bringToFront();
    toast(`Satélite VIIRS (NASA), ${fechaSatelite}. Muestra nubes y lluvia, no el cauce.`);
  } else capas.satelite.remove();
}

function pintarCauceYZonas() {
  if (!mapa) return;
  const e = estadoBase();
  const color = colorNivelActual();
  const txtNivel = e.nivel === null ? "Sin datos del sensor" : NIVELES[e.nivel].corto;
  capas.cauce.clearLayers();
  capas.zonas.clearLayers();
  ZONAS_SIRENA.forEach((z) => {
    L.circle(z.centro, {
      radius: z.radio, color, weight: 1.5, fillColor: color, fillOpacity: e.nivel === 3 ? 0.22 : 0.08,
      dashArray: "4 6", className: e.nivel === 3 ? "zona-pulso" : ""
    }).bindTooltip(`${esc(z.nombre)} · zona de sirena (referencial)`).addTo(capas.zonas);
  });
  // Cauce: línea punteada fina con el color del nivel (trazado referencial)
  L.polyline(CAUCE_REFERENCIAL, { color, weight: 4, opacity: 0.9, dashArray: "2 8", lineCap: "round" })
    .bindPopup(`<strong>Quebrada San Ildefonso</strong><br>Nivel: ${esc(txtNivel)}<br><span class="cuenta">Trazado referencial</span>`)
    .addTo(capas.cauce);
}

function estadoReporte(r) {
  const c = r.confirmaciones || 0, n = r.negaciones || 0;
  if (c + n >= VOTOS_MIN && n > c) return "descartado";
  const ultimo = Math.max(r.creado || 0, r.ultimaConfirmacion || 0, r.verificadoEn || 0);
  if (ahora() - ultimo > REPORTE_CADUCA_MS) return "caducado";
  if (r.verificadoAutoridad || c >= VOTOS_MIN) return "confirmado";
  return "sinValidar";
}
const NOMBRE_ESTADO = { sinValidar: "Sin validar", confirmado: "Confirmado", descartado: "Descartado", caducado: "Caducado" };

let firmaReportes = "";
function pintarReportes(forzar = true) {
  if (!mapa) return;
  // En el refresco periódico solo se repinta si cambió el estado de algún reporte (no cierra popups abiertos)
  const firma = Object.entries(S.reportes || {}).map(([id, r]) => id + ":" + estadoReporte(r)).join("|");
  if (!forzar && firma === firmaReportes) return;
  firmaReportes = firma;
  capas.reportes.clearLayers();
  capas.bloqueos.clearLayers();
  marcadoresReporte = {};
  Object.entries(S.reportes || {}).forEach(([id, r]) => {
    if (typeof r?.lat !== "number" || typeof r?.lng !== "number") return;
    const est = estadoReporte(r);
    if (est === "descartado" || est === "caducado") return; // se ocultan
    const T = TIPOS_REPORTE[r.tipo] || TIPOS_REPORTE.otro;
    const conf = est === "confirmado";
    const icono = L.divIcon({
      className: "",
      html: `<div class="mk ${conf ? "" : "sin-validar"} ${r.verificadoAutoridad ? "verificado" : ""}" style="background:${T.color};position:relative">${ic(T.icono)}</div>`,
      iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16]
    });
    const tramo = trazoDe(r);
    if (tramo) {
      // Tramo de calle: línea que sigue las calles (gris punteada sin validar; color del tipo al confirmarse; bloqueo = rojo)
      const colorT = conf ? (r.tipo === "bloqueo" ? "#C62828" : T.color) : "#9E9E9E";
      L.polyline(tramo, { color: "#fff", weight: 11, opacity: 0.9 }).addTo(capas.bloqueos);
      L.polyline(tramo, { color: colorT, weight: 7, opacity: 0.95, dashArray: conf ? null : "8 8" })
        .bindTooltip(`${T.nombre} · tramo de ~${Math.round(r.largo || 0)} m · ${NOMBRE_ESTADO[est]}`)
        .bindPopup(() => htmlPopup(id, r, est), { maxWidth: 270, autoPanPaddingTopLeft: [12, 70], autoPanPaddingBottomRight: [12, 150] })
        .addTo(capas.bloqueos);
    } else if (conf && r.tipo === "bloqueo") {
      L.circle([r.lat, r.lng], { radius: 70, color: "#C62828", weight: 3, fillColor: "#C62828", fillOpacity: 0.35 })
        .bindTooltip("Calle bloqueada (confirmada)").addTo(capas.bloqueos);
    }
    marcadoresReporte[id] = L.marker([r.lat, r.lng], { icon: icono, title: T.nombre }).bindPopup(() => htmlPopup(id, r, est), { maxWidth: 270, autoPanPaddingTopLeft: [12, 70], autoPanPaddingBottomRight: [12, 150] }).addTo(capas.reportes);
  });
}

/* ---------- Listas de reportes (Inicio y hoja del mapa) ---------- */
let filtroMapa = "todos";
let marcadoresReporte = {};
function itemsReportes() {
  const p = S.ubicacion ? [S.ubicacion.lat, S.ubicacion.lng] : null;
  return Object.entries(S.reportes || {})
    .filter(([, r]) => r && typeof r.lat === "number")
    .map(([id, r]) => ({ id, r, est: estadoReporte(r), dist: p ? distAReporte(p, r) : null }))
    .filter((x) => x.est === "sinValidar" || x.est === "confirmado")
    .sort((a, b) => (a.dist !== null && b.dist !== null) ? a.dist - b.dist : (b.r.creado || 0) - (a.r.creado || 0));
}
function htmlItemReporte(x) {
  const T = TIPOS_REPORTE[x.r.tipo] || TIPOS_REPORTE.otro;
  const badge = x.r.verificadoAutoridad ? ["autoridad", "Verificado"] : x.est === "confirmado" ? ["confirmado", "Confirmado"] : ["sinValidar", "Sin validar"];
  const dist = x.dist === null ? "" : x.dist < 1000 ? ` · ${Math.round(x.dist / 10) * 10} m` : ` · ${(x.dist / 1000).toFixed(1)} km`;
  return `<li><button class="item-reporte" data-rep="${esc(x.id)}">
    <span class="item-foto" data-foto-item="${esc(x.id)}">${ic(T.icono)}</span>
    <span><span class="item-titulo">${esc(T.nombre)}${trazoDe(x.r) ? " (tramo)" : ""}</span>
      <span class="item-meta">${hace(x.r.creado)}${dist}</span></span>
    <span class="estado-badge ${badge[0]}">${badge[1]}</span></button></li>`;
}
async function cargarMiniaturas(cont, max = 10) {
  const spans = [...cont.querySelectorAll("[data-foto-item]")].slice(0, max);
  for (const sp of spans) {
    const id = sp.dataset.fotoItem, r = S.reportes[id];
    if (!r || !(r.foto || r.tieneFoto)) continue;
    try {
      const f = await Datos.getFoto(id, r);
      if (f && sp.isConnected) { const img = document.createElement("img"); img.className = "item-foto"; img.alt = ""; img.src = f; sp.replaceWith(img); }
    } catch (e) { console.warn("Miniatura:", e); }
  }
}
function renderListas() {
  const items = itemsReportes();
  // Inicio: solo lo que está cerca (si no hay ubicación o no hay nada cerca, la sección no aparece)
  const cerca = S.ubicacion ? items.filter((x) => x.dist !== null && x.dist <= RADIO_CERCANOS_M) : [];
  $("#seccionCercanos").hidden = cerca.length === 0;
  const ini = $("#listaReportesInicio");
  ini.innerHTML = cerca.slice(0, 3).map(htmlItemReporte).join("");
  cargarMiniaturas(ini, 3);
  const conf = items.filter((x) => x.est === "confirmado").length;
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  $("#resumenReportes").textContent = items.length ? `${pl(items.length, "activo", "activos")} · ${pl(conf, "confirmado", "confirmados")}` : "ninguno activo";
  const fil = items.filter((x) => filtroMapa === "todos" || x.est === filtroMapa);
  const lm = $("#listaReportesMapa");
  lm.innerHTML = fil.length ? fil.map(htmlItemReporte).join("") : '<li class="lista-vacia">No hay reportes con este filtro.</li>';
  cargarMiniaturas(lm, 10);
}
function verReporteEnMapa(id) {
  irATab("mapa");
  const r = S.reportes[id];
  if (!mapa || !r) return;
  $("#hojaMapa").dataset.abierta = "false";
  $("#asaHoja").setAttribute("aria-expanded", "false");
  mapa.setView([r.lat, r.lng], 16, { animate: false });
  setTimeout(() => marcadoresReporte[id]?.openPopup(), 300);
}

function htmlPopup(id, r, est) {
  const T = TIPOS_REPORTE[r.tipo] || TIPOS_REPORTE.otro;
  const esMio = r.autor === Datos.uid;
  const yaVote = !!(r.votos && r.votos[Datos.uid]);
  let nota = "";
  if (esMio) nota = "Es tu reporte: otros vecinos lo confirmarán.";
  else if (yaVote) nota = "Ya respondiste a este reporte.";
  let lejos = false;
  if (proximidadActiva() && !esMio && !yaVote && S.ubicacion) {
    const d = distAReporte([S.ubicacion.lat, S.ubicacion.lng], r);
    if (d > RADIO_VOTO_M) { lejos = true; nota = `Solo responden vecinos a menos de ${RADIO_VOTO_M / 1000} km (estás a ${(d / 1000).toFixed(1)} km).`; }
  }
  const dis = esMio || yaVote || lejos ? "disabled" : "";
  const estado = r.verificadoAutoridad ? "Verificado por la autoridad" : NOMBRE_ESTADO[est];
  return `<div class="popup-rep">
    <div class="popup-cab">
      ${r.foto || r.tieneFoto ? `<button type="button" class="popup-mini" aria-label="Ver foto en grande">
        <img ${r.foto ? `src="${esc(r.foto)}"` : `data-foto-id="${esc(id)}"`} alt="" data-pie="${esc(T.nombre)} · ${hace(r.creado)}">${ic("maximize")}</button>` : ""}
      <div><h4>${ic(T.icono)} ${esc(T.nombre)}</h4>
      <span class="cuenta">${estado} · ${hace(r.creado)}${trazoDe(r) ? ` · tramo de ${Math.round(r.largo || 0)} m` : ""}</span></div>
    </div>
    ${r.descripcion ? `<p class="popup-desc">${esc(r.descripcion)}</p>` : ""}
    <p class="pregunta">¿Sigue este problema?</p>
    <div class="votos">
      <button class="si" data-voto="1" data-id="${esc(id)}" ${dis}>${ic("check")}Confirmar</button>
      <button data-voto="-1" data-id="${esc(id)}" ${dis}>${ic("x")}Ya no está</button>
    </div>
    <p class="cuenta">${r.confirmaciones || 0} confirman · ${r.negaciones || 0} dicen que ya no está</p>
    ${nota ? `<p class="cuenta">${nota}</p>` : ""}
  </div>`;
}

function pintarYo() {
  if (!mapa || !S.ubicacion) return;
  const ll = [S.ubicacion.lat, S.ubicacion.lng];
  if (!marcadorYo) {
    marcadorYo = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="mk-yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 })
      .bindTooltip("Tú estás aquí").addTo(mapa);
  } else marcadorYo.setLatLng(ll);
}

/* ---------- Dirección de evacuación referencial ---------- */
function puntoMasCercanoEnCauce(p) {
  // Proyección local en metros
  const rad = Math.PI / 180, R = 6371000, cosLat = Math.cos(p[0] * rad);
  const toXY = (q) => [(q[1] - p[1]) * rad * cosLat * R, (q[0] - p[0]) * rad * R];
  let mejor = { d: Infinity, xy: null, seg: null };
  for (let i = 0; i < CAUCE_REFERENCIAL.length - 1; i++) {
    const a = toXY(CAUCE_REFERENCIAL[i]), b = toXY(CAUCE_REFERENCIAL[i + 1]);
    const ab = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, (-a[0] * ab[0] - a[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
    const q = [a[0] + t * ab[0], a[1] + t * ab[1]];
    const d = Math.hypot(q[0], q[1]);
    if (d < mejor.d) mejor = { d, xy: q, seg: ab };
  }
  return { ...mejor, cosLat };
}

/* Elevación del terreno: Open-Meteo Elevation API (Copernicus DEM GLO-90, 90 m). Hasta 100 puntos por consulta. */
async function elevaciones(puntos) {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${puntos.map((p) => p[0].toFixed(5)).join(",")}&longitude=${puntos.map((p) => p[1].toFixed(5)).join(",")}`;
  const j = await fetchJSON(url, 8000);
  if (!Array.isArray(j.elevation) || j.elevation.length !== puntos.length) throw new Error("Elevación incompleta");
  return j.elevation;
}

/* Busca alrededor del usuario (300–1100 m, 16 direcciones) el punto más alto que además
   quede más lejos del peligro que el usuario. Devuelve { destino, ganancia } o null si no hay datos. */
async function buscarZonaAlta(p, distAlPeligro) {
  const rad = Math.PI / 180, RT = 6371000, cosLat = Math.cos(p[0] * rad);
  const dUsuario = distAlPeligro(p);
  const cands = [];
  for (const d of [300, 500, 800, 1100]) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const q = [p[0] + (Math.sin(a) * d) / (RT * rad), p[1] + (Math.cos(a) * d) / (RT * rad * cosLat)];
      if (distAlPeligro(q) >= dUsuario + 150) cands.push({ q, d });
    }
  }
  if (!cands.length) return null;
  const elev = await elevaciones([p, ...cands.map((c) => c.q)]);
  let mejor = null;
  cands.forEach((c, i) => {
    const ganancia = elev[i + 1] - elev[0];
    const puntaje = ganancia - c.d / 250; // prefiere lo alto, pero también lo cercano
    if (!mejor || puntaje > mejor.puntaje) mejor = { destino: { lat: c.q[0], lng: c.q[1] }, ganancia, puntaje };
  });
  return mejor;
}

async function mostrarEvacuacion() {
  cerrarAlarma();
  irATab("mapa");
  if (!mapa) return;
  $("#hojaMapa").dataset.abierta = "false";
  if (!S.ubicacion) await pedirUbicacion();
  capas.evac.clearLayers();
  // Mostrar el cauce como referencia mientras se ve la ruta
  capas.cauce.addTo(mapa);
  $('.chip[data-capa="cauce"]')?.setAttribute("aria-pressed", "true");
  $("#panelEvac").hidden = false;
  const nota = (extra = "") => `<p class="evac-nota">Ruta referencial${extra}. Confirma con Defensa Civil y sigue a los brigadistas.</p>`;
  if (!S.ubicacion) {
    $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("locate-fixed")} Activa tu ubicación</p><p>Mientras tanto: aléjate hacia los costados de la quebrada, nunca a lo largo del cauce.</p>`;
    mapa.fitBounds(L.polyline(CAUCE_REFERENCIAL).getBounds(), { padding: [30, 30], animate: false });
    return;
  }
  const p = [S.ubicacion.lat, S.ubicacion.lng];
  const e = estadoEfectivo();
  const porHuaico = esPorReporte(e) && e.reporte;
  const distAlPeligro = porHuaico
    ? (q) => distM(q, [e.reporte.lat, e.reporte.lng])
    : (q) => puntoMasCercanoEnCauce(q).d;
  if (!porHuaico && distAlPeligro(p) > 2500) {
    $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("circle-check")} Estás lejos del cauce</p><p>A ${(distAlPeligro(p) / 1000).toFixed(1)} km. Quédate en un lugar seguro y sigue las indicaciones oficiales.</p>`;
    mapa.setView(p, 14, { animate: false });
    return;
  }
  $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("route")} Buscando la zona más alta cercana…</p>`;

  let zona = null, sinElevacion = false;
  try { zona = await buscarZonaAlta(p, distAlPeligro); } catch (err) { console.warn("Elevación:", err); sinElevacion = true; }
  const hayZonaAlta = zona && zona.ganancia >= 5;
  let destino;
  if (hayZonaAlta) {
    destino = zona.destino;
  } else {
    // Terreno plano o sin datos: alejarse del peligro 700 m (dirección perpendicular)
    const rad = Math.PI / 180, RT = 6371000, cosLat = Math.cos(p[0] * rad);
    let v;
    if (porHuaico) v = [(p[1] - e.reporte.lng) * rad * cosLat * RT, (p[0] - e.reporte.lat) * rad * RT];
    else { const pc = puntoMasCercanoEnCauce(p); v = pc.d > 25 ? [-pc.xy[0], -pc.xy[1]] : [-pc.seg[1], pc.seg[0]]; }
    const len = Math.hypot(v[0], v[1]) || 1;
    destino = { lat: p[0] + (v[1] / len * 700) / (RT * rad), lng: p[1] + (v[0] / len * 700) / (RT * rad * cosLat) };
  }
  const ruta = await rutaPorCalles({ lat: p[0], lng: p[1] }, destino);
  const recta = ruta.metodo.startsWith("línea recta");
  L.polyline(ruta.trazo, { color: "#fff", weight: 10, opacity: 0.9 }).addTo(capas.evac);
  L.polyline(ruta.trazo, { color: "#1565C0", weight: 6, dashArray: recta ? "10 8" : null }).addTo(capas.evac);
  const fin = ruta.trazo[ruta.trazo.length - 1];
  L.marker(fin, { icon: L.divIcon({ className: "", html: `<div class="mk" style="background:#1565C0">${ic(hayZonaAlta ? "arrow-up" : "navigation")}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
    .bindTooltip(hayZonaAlta ? `Zona ${Math.round(zona.ganancia)} m más alta (referencial)` : "Punto alejado del peligro (referencial)").addTo(capas.evac);
  const min = Math.max(1, Math.round(ruta.largo / 75)); // ~4,5 km/h caminando
  const que = hayZonaAlta
    ? `<p>Lleva a una zona <strong>${Math.round(zona.ganancia)} m más alta</strong>, lejos del ${porHuaico ? "huaico" : "cauce"}.</p>`
    : sinElevacion
      ? `<p>Sin datos de elevación: aléjate del ${porHuaico ? "huaico" : "cauce"} por esta ruta.</p>`
      : `<p>Tu zona es plana: no hay un lugar más alto cerca. Aléjate del ${porHuaico ? "huaico" : "cauce"} y, si no puedes, sube al piso más alto.</p>`;
  $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("footprints")} ${Math.round(ruta.largo)} m · ${min} min a pie</p>${que}`
    + nota((recta ? ", en línea recta" : "") + (hayZonaAlta ? ". Elevación: Copernicus DEM vía Open-Meteo" : ""));
  // Deja espacio para el panel de arriba y para el botón "Reportar" y la hoja de abajo
  mapa.fitBounds(L.latLngBounds([p, fin].concat(ruta.trazo)), { paddingTopLeft: [30, 230], paddingBottomRight: [30, 170], animate: false });
}

function abrirVisor(src, pie) {
  $("#visorImg").src = src;
  $("#visorPie").textContent = pie;
  $("#visorFoto").hidden = false;
  $("#btnCerrarVisor").focus();
}
function cerrarVisor() { $("#visorFoto").hidden = true; $("#visorImg").removeAttribute("src"); }

/* ---------------------------------------------------------------------
   NUEVO REPORTE
--------------------------------------------------------------------- */
const R = { tipo: null, foto: null, lat: null, lng: null, origenUbic: null, forma: "punto", trazo: null, metodoTrazo: null, largo: null };
let capaTemp = null; // vista previa del punto o tramo mientras se arma el reporte

function abrirReporte() {
  $("#hojaReporte").hidden = false;
  // Reporte nuevo: empezar desde arriba (si no, la cabecera fija tapa los primeros botones)
  if (!R.tipo && R.lat === null && !R.trazo) $("#formReporte").scrollTop = 0;
  $("#avisoProximidad").hidden = !proximidadActiva();
  actualizarBotonesUbicacion();
  if (R.forma === "punto" && R.lat === null) usarGPSReporte();
  validarFormReporte();
}
/* Punto: por defecto es tu ubicación (GPS). "Elegir otro lugar" solo aparece cuando la app
   permite reportar desde cualquier lugar (modo cercanía apagado). */
function actualizarBotonesUbicacion() {
  const porGPS = typeof R.origenUbic === "string" && R.origenUbic.startsWith("GPS");
  $("#btnElegirMapa").hidden = proximidadActiva();
  $("#btnGPS").hidden = porGPS || buscandoGPS;
}
let buscandoGPS = false;
async function usarGPSReporte() {
  if (buscandoGPS) return;
  buscandoGPS = true; actualizarBotonesUbicacion();
  $("#textoUbicacion").textContent = "Buscando tu ubicación…";
  const u = await pedirUbicacion();
  buscandoGPS = false;
  // Si mientras tanto eligió otro lugar en el mapa o cambió a tramo, no se pisa su elección
  if (R.forma !== "punto" || R.origenUbic === "elegida en el mapa") { actualizarBotonesUbicacion(); return; }
  if (u) { fijarUbicacionReporte(u.lat, u.lng, `GPS ±${u.precision} m`); mapa?.setView([u.lat, u.lng], 16, { animate: false }); }
  else $("#textoUbicacion").textContent = proximidadActiva()
    ? "Activa la ubicación de tu celular para reportar."
    : "No se pudo usar tu ubicación. Elige el lugar en el mapa.";
  actualizarBotonesUbicacion();
}
function cerrarReporte(limpiar = true) {
  $("#hojaReporte").hidden = true;
  if (limpiar) {
    Object.assign(R, { tipo: null, foto: null, lat: null, lng: null, origenUbic: null, forma: "punto", trazo: null, metodoTrazo: null, largo: null });
    elegirForma("punto");
    $("#formReporte").reset();
    $$(".opcion-tipo").forEach((b) => b.setAttribute("aria-pressed", "false"));
    $("#previewFoto").hidden = true;
    $("#contadorDesc").textContent = "0";
    $("#textoUbicacion").textContent = "Sin ubicación todavía.";
    if (marcadorTemp) { marcadorTemp.remove(); marcadorTemp = null; }
    if (capaTemp) { capaTemp.remove(); capaTemp = null; }
  }
}
function validarFormReporte() {
  const ubicOK = R.forma === "tramo" ? !!(R.trazo && R.trazo.length >= 2) : typeof R.lat === "number";
  $("#btnEnviarReporte").disabled = !(R.tipo && ubicOK);
}
function fijarUbicacionReporte(lat, lng, origen) {
  R.lat = lat; R.lng = lng; R.origenUbic = origen;
  $("#textoUbicacion").textContent = origen === "elegida en el mapa" ? "Lugar elegido en el mapa." : `Tu ubicación actual (${origen}).`;
  actualizarBotonesUbicacion();
  if (mapa) {
    if (marcadorTemp) marcadorTemp.setLatLng([lat, lng]);
    else marcadorTemp = L.marker([lat, lng], { icon: L.divIcon({ className: "", html: '<div class="mk-temp"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(mapa);
  }
  validarFormReporte();
}

/* Elegir ubicación tocando el mapa. Se captura el toque antes que Leaflet para que funcione
   aunque se toque encima del cauce, una zona o un marcador; se ignora si el usuario arrastró el mapa. */
let elegir = null;
function activarElegirEnMapa() {
  capturarToque("Toca el mapa donde está el problema", (ll) => {
    fijarUbicacionReporte(ll.lat, ll.lng, "elegida en el mapa");
    abrirReporte();
  });
}
/* Captura un toque en el mapa (antes que Leaflet) y llama a cb(latlng) */
function capturarToque(texto, cb) {
  terminarElegirEnMapa();
  $("#textoBannerElegir").textContent = texto;
  $("#bannerElegir").hidden = false;
  const cont = mapa.getContainer();
  let inicio = null;
  const down = (ev) => { inicio = [ev.clientX, ev.clientY]; };
  const click = (ev) => {
    if (ev.target.closest(".leaflet-control")) return;
    if (inicio && Math.hypot(ev.clientX - inicio[0], ev.clientY - inicio[1]) > 10) return; // fue arrastre
    ev.stopPropagation(); ev.preventDefault();
    const ll = mapa.mouseEventToLatLng(ev);
    terminarElegirEnMapa();
    cb(ll);
  };
  cont.addEventListener("pointerdown", down, true);
  cont.addEventListener("click", click, true);
  elegir = { cont, down, click };
}
function terminarElegirEnMapa() {
  $("#bannerElegir").hidden = true;
  if (!elegir) return;
  elegir.cont.removeEventListener("pointerdown", elegir.down, true);
  elegir.cont.removeEventListener("click", elegir.click, true);
  elegir = null;
}

/* ---------- Tramo de calle (estilo Waze) ---------- */
function elegirForma(forma) {
  R.forma = forma;
  $$(".opcion-forma").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.forma === forma)));
  $("#ubicPunto").hidden = forma !== "punto";
  $("#ubicTramo").hidden = forma !== "tramo";
  R.lat = R.lng = null; R.trazo = null; R.metodoTrazo = null; R.largo = null;
  if (marcadorTemp) { marcadorTemp.remove(); marcadorTemp = null; }
  if (capaTemp) { capaTemp.remove(); capaTemp = null; }
  R.origenUbic = null;
  $("#textoUbicacion").textContent = forma === "tramo"
    ? "Marca dónde empieza y dónde termina el problema en la calle."
    : "Sin ubicación todavía.";
  actualizarBotonesUbicacion();
  if (forma === "punto" && !$("#hojaReporte").hidden) usarGPSReporte();
  validarFormReporte();
}

function largoDe(trazo) {
  let d = 0;
  for (let i = 1; i < trazo.length; i++) d += distM(trazo[i - 1], trazo[i]);
  return d;
}
function simplificar(trazo, max = 150) {
  if (trazo.length <= max) return trazo;
  const k = Math.ceil(trazo.length / max);
  const out = trazo.filter((_, i) => i % k === 0);
  out.push(trazo[trazo.length - 1]);
  return out;
}

/* Ruta por calles entre a y b con servicios gratuitos basados en OpenStreetMap.
   Si ambos fallan o devuelven un desvío absurdo, se usa línea recta y se indica en el reporte. */
async function rutaPorCalles(a, b) {
  const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  const recta = distM([a.lat, a.lng], [b.lat, b.lng]);
  const fuentes = [
    ["por calles (OpenStreetMap, a pie)", `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson`],
    ["por calles (OSRM)", `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`]
  ];
  for (const [metodo, url] of fuentes) {
    try {
      const j = await fetchJSON(url, 8000);
      const ruta = j.routes && j.routes[0];
      if (j.code === "Ok" && ruta && ruta.distance <= recta * 2.5 + 300) {
        const trazo = simplificar(ruta.geometry.coordinates.map(([x, y]) => [Number(y.toFixed(6)), Number(x.toFixed(6))]));
        return { trazo, metodo, largo: largoDe(trazo) };
      }
    } catch (e) { console.warn("Ruta:", metodo, e); }
  }
  const trazo = [[a.lat, a.lng], [b.lat, b.lng]].map((p) => p.map((v) => Number(v.toFixed(6))));
  return { trazo, metodo: "línea recta (no se pudo trazar por calles)", largo: recta };
}

function marcarTramo() {
  cerrarReporte(false);
  irATab("mapa");
  if (!mapa) { abrirReporte(); return; }
  if (marcadorTemp) { marcadorTemp.remove(); marcadorTemp = null; }
  if (capaTemp) { capaTemp.remove(); capaTemp = null; }
  // Acercar a nivel de calle para que los toques marquen cuadras, no kilómetros
  if (mapa.getZoom() < 16) mapa.setView(S.ubicacion ? [S.ubicacion.lat, S.ubicacion.lng] : mapa.getCenter(), 16, { animate: false });
  capturarToque("Toca dónde empieza el problema", (a) => {
    capaTemp = L.layerGroup().addTo(mapa);
    L.circleMarker(a, { radius: 8, color: "#fff", weight: 3, fillColor: "#1565C0", fillOpacity: 1 }).bindTooltip("Inicio").addTo(capaTemp);
    capturarToque("Ahora toca dónde termina", async (b) => {
      L.circleMarker(b, { radius: 8, color: "#fff", weight: 3, fillColor: "#1565C0", fillOpacity: 1 }).bindTooltip("Fin").addTo(capaTemp);
      $("#textoBannerElegir").textContent = "Trazando el tramo por las calles…";
      $("#bannerElegir").hidden = false;
      const res = await rutaPorCalles(a, b);
      $("#bannerElegir").hidden = true;
      if (res.largo > TRAMO_MAX_M) {
        capaTemp.remove(); capaTemp = null;
        R.trazo = null; R.lat = R.lng = null;
        $("#textoUbicacion").textContent = `El tramo mide ~${(res.largo / 1000).toFixed(1)} km: es demasiado largo. Acerca el mapa y marca solo la calle afectada.`;
        validarFormReporte();
        abrirReporte();
        return;
      }
      L.polyline(res.trazo, { color: "#1565C0", weight: 7, opacity: 0.85 }).addTo(capaTemp);
      mapa.fitBounds(L.polyline(res.trazo).getBounds().pad(0.4), { animate: false });
      R.trazo = res.trazo; R.metodoTrazo = res.metodo; R.largo = Math.round(res.largo);
      const medio = res.trazo[Math.floor(res.trazo.length / 2)];
      R.lat = medio[0]; R.lng = medio[1]; R.origenUbic = "tramo elegido en el mapa";
      $("#textoUbicacion").textContent = `Tramo de ${R.largo} m${res.metodo.startsWith("línea recta") ? " (línea recta: no se pudo seguir las calles)" : ""}.`;
      validarFormReporte();
      setTimeout(abrirReporte, 700); // deja ver el tramo un instante antes de volver al formulario
    });
  });
}

/* Compresión en el navegador: máx. 800 px, JPEG calidad 0.6 → base64 */
function comprimirImagen(file, max = 800, calidad = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function prepararFormReporte() {
  $("#opcionesTipo").innerHTML = Object.entries(TIPOS_REPORTE).map(([k, t]) =>
    `<button type="button" class="opcion-tipo" data-tipo="${k}" aria-pressed="false">${ic(t.icono)}${t.nombre}</button>`).join("");
  $("#opcionesTipo").addEventListener("click", (e) => {
    const b = e.target.closest(".opcion-tipo"); if (!b) return;
    $$(".opcion-tipo").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    R.tipo = b.dataset.tipo; validarFormReporte();
  });
  $("#inputFoto").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      R.foto = await comprimirImagen(f);
      $("#imgPreview").src = R.foto; $("#previewFoto").hidden = false;
      toast(`Foto lista (${Math.round(R.foto.length * 0.75 / 1024)} KB)`);
    } catch (err) { toast(err.message); }
  });
  $("#btnQuitarFoto").onclick = () => { R.foto = null; $("#inputFoto").value = ""; $("#previewFoto").hidden = true; };
  $("#inputDesc").addEventListener("input", (e) => ($("#contadorDesc").textContent = e.target.value.length));
  $("#btnGPS").onclick = () => usarGPSReporte();
  $("#btnCerrarVisor").onclick = cerrarVisor;
  $("#visorFoto").addEventListener("click", (e) => { if (e.target.id === "visorFoto") cerrarVisor(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#visorFoto").hidden) cerrarVisor(); });
  $("#btnElegirMapa").onclick = () => {
    cerrarReporte(false);
    irATab("mapa");
    if (!mapa) { abrirReporte(); return; }
    activarElegirEnMapa();
  };
  $("#btnCancelarElegir").onclick = () => { terminarElegirEnMapa(); abrirReporte(); };
  $$(".opcion-forma").forEach((b) => b.addEventListener("click", () => elegirForma(b.dataset.forma)));
  $("#btnMarcarTramo").onclick = marcarTramo;
  $("#btnCerrarReporte").onclick = () => cerrarReporte(true);
  $("#hojaReporte").addEventListener("click", (e) => { if (e.target.id === "hojaReporte") cerrarReporte(false); });

  $("#formReporte").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("#btnEnviarReporte").disabled) return;
    if (proximidadActiva()) {
      const u = await pedirUbicacion();
      if (!u) { $("#textoUbicacion").textContent = "Activa tu ubicación: en modo cercanía solo puedes reportar cerca de donde estás."; return; }
      const d = distAReporte([u.lat, u.lng], { lat: R.lat, lng: R.lng, forma: R.forma, trazo: R.trazo });
      if (d > RADIO_REPORTE_M + Math.min(u.precision || 0, 100)) {
        $("#textoUbicacion").textContent = `Solo puedes reportar a menos de ${RADIO_REPORTE_M} m de donde estás (este punto está a ~${Math.round(d)} m).`;
        return;
      }
    }
    const btn = $("#btnEnviarReporte");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await Datos.addReporte({
        tipo: R.tipo,
        descripcion: $("#inputDesc").value.trim().slice(0, 200),
        lat: Number(R.lat.toFixed(6)), lng: Number(R.lng.toFixed(6)),
        foto: R.foto || null,
        forma: R.forma,
        ...(R.forma === "tramo" ? { trazo: R.trazo, largo: R.largo, metodoTrazo: R.metodoTrazo } : {})
      });
      cerrarReporte(true);
      toast("Reporte enviado. Aparecerá en gris hasta que 3 vecinos lo confirmen.");
    } catch (err) {
      console.error(err); toast("No se pudo enviar: " + err.message, 5000);
    } finally { btn.textContent = "Enviar reporte"; validarFormReporte(); }
  });
}

/* ---------------------------------------------------------------------
   PREPÁRATE
--------------------------------------------------------------------- */
let nivelGuia = null; // nivel elegido por el usuario en Prepárate (null = el actual)
function renderGuia() {
  const cont = $("#guiaNiveles");
  if (!cont) return;
  const actual = estadoEfectivo().nivel;
  const sel = nivelGuia ?? (actual ?? 0);
  const N = NIVELES[sel], g = GUIA_NIVELES[sel] || {};
  const bloque = (t, arr) => arr ? `<h4>${t}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  cont.innerHTML = `<div class="niveles-sel" role="group" aria-label="Elegir nivel">${NIVELES.map((M) =>
      `<button class="nivel-sel" data-n="${M.n}" aria-pressed="${M.n === sel}" style="--c:${M.color}">${M.corto}</button>`).join("")}</div>
    <div class="guia-panel">
      <p class="guia-mensaje nivel-${sel}">${esc(N.mensaje)}</p>
      ${bloque("Antes", g.antes)}${bloque("Durante", g.durante)}${bloque("Después", g.despues)}
    </div>`;
}

function renderPreparate() {
  renderGuia();

  renderMochila();
  $("#listaMochila").onclick = (ev) => {
    const b = ev.target.closest(".objeto"); if (!b) return;
    const i = Number(b.dataset.i), m = lsGet("previunt_mochila", {});
    m[i] = !m[i]; lsSet("previunt_mochila", m);
    const O = MOCHILA[i];
    $("#mochilaDetalle").innerHTML = `<strong>${esc(O.corto)}</strong>: ${esc(O.detalle)}${m[i] ? "" : " (lo sacaste)"}`;
    renderMochila(i);
  };
  $("#btnReiniciarMochila").onclick = () => {
    lsSet("previunt_mochila", {});
    $("#mochilaDetalle").textContent = "Toca cada cosa cuando ya la tengas.";
    renderMochila();
  };

  $("#listaNumeros").innerHTML = NUMEROS_EMERGENCIA.map((n) =>
    `<li class="${n.mostrar ? "ancho" : ""}"><a href="tel:${n.numero}">${ic("phone")}<span><span class="num">${esc(n.mostrar || n.numero)}</span><span class="nombre">${esc(n.nombre)}</span></span></a></li>`).join("");
  $("#numerosFuente").innerHTML = '<a href="https://www.gob.pe/547" target="_blank" rel="noopener">gob.pe</a>, Gob. Regional La Libertad. Lluvia: ERA5 (Open-Meteo). Mapa: © OpenStreetMap.';
  $("#fuenteGuia").href = FUENTE_GUIA;
  $("#fuenteMochila").href = FUENTE_MOCHILA;
}

/* Mochila: cada objeto se enciende al tocarlo; con los 14, "Mochila lista" */
function renderMochila(recien = null) {
  const m = lsGet("previunt_mochila", {});
  const total = MOCHILA.length, n = MOCHILA.filter((_, i) => m[i]).length;
  $("#listaMochila").innerHTML = MOCHILA.map((O, i) =>
    `<button type="button" class="objeto${i === recien && m[i] ? " encendido" : ""}" data-i="${i}" aria-pressed="${!!m[i]}" style="--oc:${O.color}">${ic(O.icono)}<span>${esc(O.corto)}</span></button>`).join("");
  const completa = n === total;
  const mo = $("#mochila");
  const antes = mo.classList.contains("completa");
  mo.classList.toggle("completa", completa);
  mo.classList.toggle("recien", completa && !antes && recien !== null);
  mo.style.setProperty("--p", `${Math.round((n / total) * 100)}%`);
  $("#mochilaLista").hidden = !completa;
  const pill = $("#mochilaProgreso");
  pill.textContent = completa ? "Lista" : `${n} de ${total}`;
  pill.classList.toggle("lista", completa);
}

/* ---------------------------------------------------------------------
   HISTORIAL
--------------------------------------------------------------------- */
function renderLineaTiempo() {
  $("#lineaTiempo").innerHTML = HISTORIA.map((h) => `
    <li class="${h.pendiente ? "pendiente" : ""}">
      <div class="fecha">${esc(h.fecha)}</div>
      <p><strong>${esc(h.titulo)}.</strong> ${esc(h.texto)}</p>
      <div class="fuentes">${h.fuentes.length ? "Fuente: " + h.fuentes.map((f) => `<a href="${f.u}" target="_blank" rel="noopener">${esc(f.t)} ↗</a>`).join("") : '<span class="meta">Sin fuente verificada aún</span>'}</div>
    </li>`).join("");
}

function renderRegistro() {
  const arr = Object.values(S.historial || {}).filter((h) => nivelValido(Number(h.nivel))).sort((a, b) => b.fecha - a.fecha).slice(0, 20);
  $("#registroNiveles").innerHTML = arr.length
    ? arr.map((h) => {
        const N = NIVELES[h.nivel];
        return `<li><span class="chip-nivel nivel-${N.n}">${N.corto}</span><span>${fechaHora(h.fecha)}</span>${h.origen === "demo" ? '<span class="tag-sim">SIMULADO</span>' : ""}<span class="meta">${esc(h.fuente || (h.origen === "sensor" ? "maqueta" : "autoridad"))}</span></li>`;
      }).join("")
    : '<li class="meta">Aún no hay cambios de nivel registrados.</li>';
}

async function cargarLluviaHistorica() {
  const anioActual = Number(new Date().toLocaleString("en-US", { year: "numeric", timeZone: "America/Lima" }));
  const anios = [...new Set([2017, 2023, anioActual])];
  const meses = ["Ene", "Feb", "Mar", "Abr"];
  const hoyISO = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10); // el archivo tiene ~5 días de retraso
  const cache = lsGet("previunt_lluviaHist", {});
  const datos = {};
  try {
    for (const a of anios) {
      const fin = `${a}-04-30` < hoyISO ? `${a}-04-30` : hoyISO;
      if (`${a}-01-01` > fin) continue;
      const clave = `${a}_${fin}`;
      if (!cache[clave]) {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${TRUJILLO.lat}&longitude=${TRUJILLO.lng}&start_date=${a}-01-01&end_date=${fin}&daily=precipitation_sum&timezone=America/Lima`;
        const d = await fetchJSON(url, 15000);
        const tot = [0, 0, 0, 0], max = [0, 0, 0, 0];
        d.daily.time.forEach((t, i) => {
          const m = Number(t.slice(5, 7)) - 1, v = d.daily.precipitation_sum[i];
          if (m <= 3 && typeof v === "number") { tot[m] += v; max[m] = Math.max(max[m], v); }
        });
        cache[clave] = { tot, max, consultado: Date.now() };
        lsSet("previunt_lluviaHist", cache);
      }
      datos[a] = cache[clave];
    }
    dibujarGraficoLluvia(datos, meses);
    const consult = Math.max(...Object.values(datos).map((d) => d.consultado));
    $("#lluviaFuente").textContent = `Reanálisis ERA5 (Open-Meteo), puede subestimar picos en la costa · ${fechaHora(consult)}`;
  } catch (e) {
    console.warn("Lluvia histórica:", e);
    $("#graficoLluvia").innerHTML = '<div class="sin-datos">Sin datos disponibles</div>';
    $("#lluviaFuente").textContent = "Open-Meteo (archivo) no respondió.";
  }
}

function dibujarGraficoLluvia(datos, meses) {
  const anios = Object.keys(datos);
  const colores = ["#546E7A", "#8D6E63", "#1565C0"];
  const W = 340, H = 200, pad = { l: 34, r: 8, t: 14, b: 26 };
  const maxV = Math.max(1, ...anios.flatMap((a) => datos[a].tot));
  const escalaMax = Math.ceil(maxV / 20) * 20 || 20;
  const gw = (W - pad.l - pad.r) / meses.length;
  const bw = Math.min(22, (gw - 10) / anios.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / escalaMax);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lluvia mensual enero a abril por año">`;
  for (let i = 0; i <= 4; i++) {
    const v = (escalaMax / 4) * i;
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E2DE"/>`;
    svg += `<text x="${pad.l - 4}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#666">${Math.round(v)}</text>`;
  }
  meses.forEach((m, mi) => {
    const x0 = pad.l + gw * mi + (gw - bw * anios.length) / 2;
    anios.forEach((a, ai) => {
      const v = datos[a].tot[mi];
      const x = x0 + ai * bw;
      svg += `<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, H - pad.b - y(v))}" fill="${colores[ai % 3]}" rx="2"><title>${a} ${m}: ${v.toFixed(1)} mm (máx. diario ${datos[a].max[mi].toFixed(1)} mm)</title></rect>`;
      if (v >= 0.5) svg += `<text x="${x + (bw - 2) / 2}" y="${y(v) - 3}" font-size="8.5" text-anchor="middle" fill="#333">${v.toFixed(0)}</text>`;
    });
    svg += `<text x="${pad.l + gw * mi + gw / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#333">${m}</text>`;
  });
  svg += `<text x="4" y="10" font-size="9" fill="#666">mm</text></svg>`;
  svg += `<div class="leyenda-g">${anios.map((a, i) => `<span><span class="sw" style="background:${colores[i % 3]}"></span>${a}</span>`).join("")}</div>`;
  $("#graficoLluvia").innerHTML = svg;
}

/* ---------------------------------------------------------------------
   MODO DEMO / CENTRO DE CONTROL
--------------------------------------------------------------------- */
function renderCintaDemo() {
  const activo = !!S.demo?.activo;
  $("#cintaDemo").hidden = !activo;
  document.body.classList.toggle("con-demo", activo);
  setTimeout(() => mapa?.invalidateSize(), 50);
}

function abrirAdmin() { $("#panelAdmin").hidden = false; renderAdmin(); }

function renderAdmin() {
  if ($("#panelAdmin").hidden) return;
  const e = estadoEfectivo();
  const eb = estadoBase();
  $$(".btn-nivel").forEach((b) => b.classList.toggle("actual", eb.nivel === Number(b.dataset.nivel) && eb.fuente !== "sinReportes"));
  $("#chkProximidad").checked = proximidadActiva();
  const al = alertaPorReportes();
  $("#btnDemoOff").hidden = !S.demo?.activo;
  $("#adminEstadoDemo").textContent = (S.demo?.activo ? `Simulación activa: ${NIVELES[S.demo.nivel]?.corto || S.demo.nivel}` : eb.fuente === "autoridad" ? `Estado oficial: ${NIVELES[eb.nivel].corto} · ${eb.cita || "sin fuente"}` : "Sin estado oficial publicado.")
    + (al ? ` · Alerta por reporte de huaico: ${al.nivel === 3 ? "ROJO (verificado por autoridad)" : "NARANJA (3 vecinos)"}` : "");
  $("#adminConexion").innerHTML = Datos.modo === "firebase"
    ? `Conectado a Firebase · usuario anónimo <code>${esc(String(Datos.uid).slice(0, 8))}…</code>`
    : `Modo LOCAL (sin Firebase): datos solo en este navegador · usuario <code>${esc(String(Datos.uid).slice(0, 8))}…</code>`;
  const s = S.sensor;
  $("#adminSensor").innerHTML = s
    ? `Último estado oficial: ${esc(NIVELES[s.nivel]?.corto ?? s.nivel)} · ${esc(s.fuente || "sin fuente")} · ${fechaHora(Number(s.actualizado))}`
    : "Aún no se publicó un estado oficial.";

  const lista = Object.entries(S.reportes || {}).sort((a, b) => b[1].creado - a[1].creado);
  $("#adminReportes").innerHTML = lista.length ? lista.map(([id, r]) => {
    const T = TIPOS_REPORTE[r.tipo] || TIPOS_REPORTE.otro;
    const est = estadoReporte(r);
    return `<li><strong>${esc(T.nombre)}</strong>${trazoDe(r) ? ` · tramo ~${Math.round(r.largo || 0)} m` : ""} · ${NOMBRE_ESTADO[est]}${r.verificadoAutoridad ? " · ✔ autoridad" : ""}<br>
      <span class="meta">${esc((r.descripcion || "").slice(0, 80))} · ${fechaHora(r.creado)} · ${r.confirmaciones || 0} confirman, ${r.negaciones || 0} descartan</span>
      <div class="acciones-admin">
        <button data-acc="verificar" data-id="${esc(id)}">${r.verificadoAutoridad ? "Quitar verificación" : "Verificar (autoridad)"}</button>
        <button data-acc="si" data-id="${esc(id)}">+1 confirmar (simulado)</button>
        <button data-acc="no" data-id="${esc(id)}">+1 ya no está (simulado)</button>
        <button data-acc="borrar" data-id="${esc(id)}">Eliminar</button>
      </div></li>`;
  }).join("") : '<li class="meta">No hay reportes.</li>';
}

function prepararAdmin() {
  // Acceso oculto: 5 toques en el logo (en menos de 3 s) o ?admin=1
  let toques = [];
  $("#logo").addEventListener("click", () => {
    const t = Date.now();
    toques = toques.filter((x) => t - x < 3000).concat(t);
    if (toques.length >= 5) { toques = []; abrirAdmin(); }
  });
  if (new URLSearchParams(location.search).get("admin") === "1") abrirAdmin();

  $("#btnCerrarAdmin").onclick = () => ($("#panelAdmin").hidden = true);
  $$(".btn-nivel").forEach((b) => b.addEventListener("click", async () => {
    const n = Number(b.dataset.nivel);
    const simular = $("#chkSimular").checked;
    const fuente = $("#inputFuenteOficial").value.trim();
    if (!simular && !fuente) { toast("Escribe la fuente: aviso SENAMHI, parte del COER o inspección."); $("#inputFuenteOficial").focus(); return; }
    if (!simular && n === 3 && !confirm("Esto activa la alarma y la sirena física para toda la población. ¿Confirmas el desborde?")) return;
    try {
      Sirena.desbloquear();
      if (simular) {
        await Datos.setDemo(true, n, fuente || "Simulación");
        await Datos.addHistorial(`d_${ahora()}`, { nivel: n, estado: NIVELES[n].estado, fecha: ahora(), origen: "demo", fuente: fuente || "Simulación" });
        toast(`Simulando: ${NIVELES[n].corto}`);
      } else {
        if (S.demo?.activo) await Datos.setDemo(false, 0);
        await Datos.publicarEstado(n, fuente);
        await Datos.addHistorial(`a_${ahora()}`, { nivel: n, estado: NIVELES[n].estado, fecha: ahora(), origen: "autoridad", fuente });
        toast(`Publicado: ${NIVELES[n].corto}`);
      }
    } catch (e) { console.error(e); toast("No se pudo cambiar el estado: " + e.message); }
  }));
  $("#btnDemoOff").onclick = async () => {
    try { await Datos.setDemo(false, 0); toast("Simulación terminada: se muestra el estado oficial."); }
    catch (e) { toast("Error: " + e.message); }
  };
  $("#chkProximidad").onchange = async (e) => {
    try {
      await Datos.setProximidad(e.target.checked);
      toast(e.target.checked ? `Cercanía activada: reportar a ≤ ${RADIO_REPORTE_M} m y validar a ≤ ${RADIO_VOTO_M / 1000} km.` : "Cercanía desactivada: se puede reportar y validar desde cualquier lugar.");
    } catch (err) { toast("Error: " + err.message); }
  };
  $("#btnProbarSirena").onclick = () => Sirena.prueba(3000);
  $("#btnProbarNotif").onclick = async () => {
    if (!("Notification" in window)) return toast("Este navegador no soporta avisos.");
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return toast("Avisos bloqueados en este navegador.");
    notificar(1);
  };
  $("#adminReportes").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acc]"); if (!b) return;
    const id = b.dataset.id, r = S.reportes[id]; if (!r) return;
    try {
      if (b.dataset.acc === "verificar") await Datos.actualizarReporte(id, { verificadoAutoridad: !r.verificadoAutoridad, verificadoEn: ahora() });
      if (b.dataset.acc === "si") await Datos.votar(id, 1, "sim_" + idAleatorio().slice(0, 8));
      if (b.dataset.acc === "no") await Datos.votar(id, -1, "sim_" + idAleatorio().slice(0, 8));
      if (b.dataset.acc === "borrar" && confirm("¿Eliminar este reporte? No se puede deshacer.")) await Datos.borrarReporte(id);
    } catch (err) { console.error(err); toast("Error: " + err.message); }
  });
}

/* ---------------------------------------------------------------------
   NAVEGACIÓN
--------------------------------------------------------------------- */
function irATab(nombre) {
  $$(".tab").forEach((t) => t.classList.toggle("activa", t.id === "tab-" + nombre));
  $$(".nav-btn").forEach((b) => b.classList.toggle("activa", b.dataset.tab === nombre));
  if (nombre === "mapa") { iniciarMapa(); setTimeout(() => mapa?.invalidateSize(), 60); }
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------------
   ARRANQUE
--------------------------------------------------------------------- */
function renderTodo() {
  renderInicio();
  renderCintaDemo();
  alCambiarNivel();
  renderAdmin();
}

async function iniciar() {
  // Navegación
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => irATab(b.dataset.tab)));
  $("#btnRutaEmergencia").onclick = mostrarEvacuacion;
  $("#btnCerrarAlarma").onclick = cerrarAlarma;
  $("#bannerEmergencia").onclick = abrirAlarma;
  $("#btnReportarInicio").onclick = abrirReporte;
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irATab(b.dataset.ir)));
  const listaClick = (ev) => { const b = ev.target.closest("[data-rep]"); if (b) verReporteEnMapa(b.dataset.rep); };
  $("#listaReportesInicio").addEventListener("click", listaClick);
  $("#listaReportesMapa").addEventListener("click", listaClick);
  $("#asaHoja").onclick = () => {
    const h = $("#hojaMapa"), abierta = h.dataset.abierta !== "true";
    h.dataset.abierta = String(abierta); $("#asaHoja").setAttribute("aria-expanded", String(abierta));
  };
  $$(".filtro").forEach((b) => b.addEventListener("click", () => {
    filtroMapa = b.dataset.filtro;
    $$(".filtro").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderListas();
  }));
  $$(".chip[data-capa]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (!mapa) return;
    if (b.dataset.capa === "satelite") { alternarSatelite(on, b); return; }
    const grupos = b.dataset.capa === "reportes" ? [capas.reportes, capas.bloqueos] : b.dataset.capa === "cauce" ? [capas.cauce] : [capas.zonas];
    grupos.forEach((g) => on ? g.addTo(mapa) : g.remove());
  }));
  $("#btnCentrarme").onclick = async () => { const u = await pedirUbicacion(); if (u && mapa) mapa.setView([u.lat, u.lng], 16, { animate: false }); };
  $("#guiaNiveles").addEventListener("click", (ev) => {
    const b = ev.target.closest(".nivel-sel"); if (!b) return;
    nivelGuia = Number(b.dataset.n); renderGuia();
  });
  let lluviaCargada = false;
  $("#detLluvia").addEventListener("toggle", () => { if ($("#detLluvia").open && !lluviaCargada) { lluviaCargada = true; cargarLluviaHistorica(); } });
  $("#btnCerrarEvac").onclick = () => { $("#panelEvac").hidden = true; capas.evac?.clearLayers(); };
  $("#btnReportar").onclick = abrirReporte;
  $("#btnSonidoSirena").onclick = () => Sirena.desbloquear();
  $("#btnSilenciar").onclick = () => Sirena.silenciar();
  $("#btnUbicacion").onclick = async () => { if (await pedirUbicacion()) cargarClima(); };

  prepararFormReporte();
  prepararAdmin();
  prepararBotonNotif();
  renderLineaTiempo();
  renderPreparate();

  await Datos.init();
  const badge = $("#badgeConexion");
  badge.textContent = Datos.modo === "firebase" ? "● En línea" : "● Modo local";
  badge.classList.toggle("local", Datos.modo !== "firebase");
  badge.title = Datos.modo === "firebase" ? "Datos en tiempo real desde Firebase" : "Sin Firebase: los datos se guardan solo en este navegador";

  Datos.suscribir("sensor", (v) => { S.sensor = v; renderTodo(); });
  Datos.suscribir("demo", (v) => { S.demo = v || { activo: false, nivel: 0 }; renderTodo(); });
  Datos.suscribir("reportes", (v) => { S.reportes = v || {}; pintarReportes(); renderTodo(); renderListas(); });
  Datos.suscribir("historial", (v) => { S.historial = v || {}; renderRegistro(); });

  // Revisión periódica: antigüedad del sensor y caducidad de reportes
  setInterval(() => { renderTodo(); pintarReportes(false); }, 5000);

  // Ubicación: si ya dio permiso antes, usarla sin preguntar
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" });
    if (p?.state === "granted" || lsGet("previunt_geoOK", false) && p?.state !== "denied") await pedirUbicacion({ silencioso: true });
  } catch {}
  cargarClima();
  setInterval(cargarClima, 10 * 60 * 1000);
  setInterval(renderListas, 60 * 1000); // refresca "hace X min" y caducidad
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e)));
}

iniciar();
