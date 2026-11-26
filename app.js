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
const RADIO_LISTA_M = 2000;                  // lista del mapa: solo reportes a menos de 2 km
/* Mapa base más limpio (CARTO Voyager). Clave gratuita, sin cuenta: https://carto.com/basemaps/apikey
   (uso no comercial gratis hasta 5 millones de teselas al mes; hay que mantener visible "© OpenStreetMap, © CARTO").
   Vacía = se usa OpenStreetMap estándar. */
const CARTO_KEY = "cb1_5fmm_1_22186419f51462a8001d1885";               // Inicio solo muestra reportes a menos de 1 km                    // un tramo reportado no puede medir más de 2 km
/* Modo cercanía (se activa en el centro de control; apagado por defecto para la demo) */
const RADIO_REPORTE_M = 500;                 // solo se puede reportar a menos de 500 m de donde estás
const RADIO_VOTO_M = 1000;                   // solo validan quienes están a menos de 1 km del reporte
const proximidadActiva = () => !!(S.demo && S.demo.proximidad);          // un huaico confirmado a menos de 1 km sube la alerta del usuario

// Acción de Inicio que abre el mapa con la ruta de evacuación desde tu ubicación
const RUTA_EVAC = { ruta: true, texto: "Conoce tu ruta" };

// Sistema de colores normado (igual en toda la app)
/* El estado NO viene de un sensor: lo publica la autoridad (Defensa Civil, COER La Libertad, municipalidad)
   desde el Panel de autoridad, citando su fuente (aviso SENAMHI, parte del COER, inspección en campo).
   El nivel 2 (huaico) solo lo producen los reportes vecinales confirmados.
   Se guarda en /quebrada_san_ildefonso/nivel (0-3), que es lo que lee la sirena física. */
const NIVELES = [
  {
    n: 0, estado: "SECA", corto: "Seco", color: "#2E7D32", titulo: "Seco", icono: "circle-check",
    mensaje: "Sin avisos ni reportes de activación.",
    acciones: ["Ten lista tu mochila de emergencia", RUTA_EVAC, "No arrojes basura al cauce"]
  },
  {
    n: 1, estado: "EN AUMENTO", corto: "En aumento", color: "#F9A825", titulo: "En aumento", icono: "arrow-up",
    mensaje: "Lluvias y caudal en aumento. Prepárate.",
    acciones: ["Prepara tu mochila", RUTA_EVAC, "Aléjate del cauce"]
  },
  {
    n: 2, estado: "HUAICO", corto: "Huaico", color: "#EF6C00", titulo: "Huaico reportado", icono: "triangle-alert",
    mensaje: "Vecinos reportaron un huaico cerca. Cuidado al salir.",
    acciones: [RUTA_EVAC, "Prepárate para evacuar y ubica a tu familia", "No cruces agua ni lodo"]
  },
  {
    n: 3, estado: "DESBORDE", corto: "Desborde", color: "#C62828", titulo: "Desborde", icono: "siren",
    mensaje: "Confirmado por la autoridad. Evacúa ahora a zona alta.",
    acciones: [{ ruta: true, texto: "Evacúa ahora: conoce tu ruta" }, "Si no puedes salir, sube al piso más alto", "No cruces agua ni lodo"]
  }
];
// Estados que puede publicar la autoridad (el huaico lo marcan los vecinos)
const NIVELES_AUTORIDAD = [0, 1, 3];

/* Trazado REFERENCIAL del cauce de San Ildefonso (aguas arriba → mar).
   Tramo alto hasta el ápice (-8.0701, -79.0003): eje trazado por el equipo (J. 26/11/2026) sobre el "Mapa de rutas de
   evacuación y zonas de refugio – Quebrada San Idelfonso" de la ANA (set. 2015), ±50–100 m. Pasa a menos de 100 m de los
   puntos críticos oficiales (CENEPRED capa 25 "El Baden"; INGEMMET A7457). El trazado anterior quedaba 0,8–2,5 km al este.
   Aguas abajo del ápice: trazado anterior (prensa: Mampuesto, av. 9 de Octubre, centro, Víctor Larco); no hay trazado oficial.
   TODO: verificar con fuente oficial el trazado exacto (ANA / Municipalidad Provincial de Trujillo – plan "Ruta del Agua"). */
const CAUCE_TRAMO_ALTO = [
  [-8.04438, -78.98747], [-8.04700, -78.98837], [-8.04961, -78.98993], [-8.05119, -78.99136], [-8.05302, -78.99292],
  [-8.05499, -78.99462], [-8.05655, -78.99526], [-8.05812, -78.99617], [-8.05969, -78.99721], [-8.06126, -78.99812],
  [-8.06296, -78.99877], [-8.06479, -78.99928], [-8.06688, -78.99974], [-8.06897, -79.00010], [-8.07014, -79.00030]
];
const CAUCE_REFERENCIAL = [
  ...CAUCE_TRAMO_ALTO,
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

/* Zonas de refugio OFICIALES: "Mapa de rutas de evacuación y zonas de refugio – Quebrada San Idelfonso", ANA, set. 2015
   (SIGRID doc. 311). El PDF no trae coordenadas: el equipo lo georreferenció con su cuadrícula UTM 17S (±15–30 m).
   Se dejan fuera a propósito:
   - Estadio Municipal de El Porvenir: se inundó con la quebrada en marzo de 2023 (Canal N) y queda ~14 m bajo el ápice.
   - Terreno baldío (0,1 ha): a ~160 m del eje del cauce y solo ~8 m más alto.
   - Albergues del COER: son para alojarse después del huaico, no para evacuar en el momento.
   TODO: confirmar vigencia con Defensa Civil de El Porvenir / COER La Libertad. */
const MAPA_ANA_2015 = "https://sigrid.cenepred.gob.pe/sigridv3/documento/311";
const ZONAS_REFUGIO = [
  { id: "ana-parque", nombre: "Zona de parque", area: "1,6 ha", lat: -8.06841, lng: -78.99501, fuente: "ANA, set. 2015", url: MAPA_ANA_2015 },
  { id: "ana-losa", nombre: "Parque y losa deportiva", area: "0,3 ha", lat: -8.08143, lng: -79.00910, fuente: "ANA, set. 2015", url: MAPA_ANA_2015 }
];

/* Criterios de evacuación (propios del equipo, NO oficiales). TODO: validar con Defensa Civil. */
const EVAC = {
  cercaCauceM: 1000,     // a esta distancia del cauce (o de un huaico verificado) se propone evacuar
  refugioMaxM: 1500,     // zona de refugio "cerca": ruta a pie de hasta 1,5 km (~20 min)
  altaMinCauceM: 400,    // la zona alta debe quedar al menos a 400 m del cauce…
  altaMinDesnivelM: 20,  // …y 20 m más alta que el punto del cauce más cercano
  altaCalleMaxM: 60,     // la ruta debe terminar a menos de 60 m del punto (que se pueda llegar caminando)
  franjaCauceM: 120,     // franja alrededor del cauce que la ruta evita
  moverseM: 200          // se recalcula si la persona se movió más de 200 m
};

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
  { nombre: "COER La Libertad", numero: "991480550", mostrar: "991 480 550" },
  { nombre: "COER La Libertad", numero: "991480611", mostrar: "991 480 611" },
  { nombre: "Municipalidad de Trujillo", numero: "044484240", mostrar: "(044) 484240" }
  // Central de la MPT: Plan de Contingencia ante Lluvias Intensas, Región La Libertad 2025-2026 (Anexo 5).
  // COER La Libertad: números entregados por el equipo el 26/11/2026.
  // TODO: verificar con fuente oficial (no figuran en el Plan de Operaciones de Emergencia Regional 2025-2026).
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

/* El estado (y la alarma) es solo el de la quebrada, publicado por la autoridad.
   Un huaico reportado por vecinos NO activa la alarma: se muestra como aviso de "Cuidado al salir". */
function estadoEfectivo() {
  return estadoBase();
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
  $("#listaAcciones").innerHTML = lista.map((a) => typeof a === "string" ? `<li>${esc(a)}</li>`
    : `<li class="accion-ruta"><button type="button" data-evac>${ic("route")}${esc(a.texto)}${ic("chevron-right")}</button></li>`).join("");
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
/* Escala del índice UV (OMS): bajo, moderado, alto, muy alto, extremo */
const UV_ESCALA = [
  { max: 2, nombre: "Bajo", color: "#289500", consejo: "Puedes estar al aire libre sin protección especial." },
  { max: 5, nombre: "Moderado", color: "#F7E400", consejo: "Usa bloqueador y busca sombra al mediodía." },
  { max: 7, nombre: "Alto", color: "#F85900", consejo: "Protégete: bloqueador, gorro, lentes y sombra entre las 10 y las 16 h." },
  { max: 10, nombre: "Muy alto", color: "#D8001D", consejo: "Evita el sol del mediodía y protégete con bloqueador, gorro y lentes." },
  { max: 99, nombre: "Extremo", color: "#6B49C8", consejo: "Evita salir al sol al mediodía. Protección máxima." }
];
const uvCategoria = (u) => UV_ESCALA.find((c) => u <= c.max + 0.49) || UV_ESCALA[4];
const uvPos = (u) => Math.max(0, Math.min(100, (u / 11) * 100));
const htmlUvBarra = (u) => `<div class="uv-barra"><i style="left:${uvPos(u).toFixed(1)}%;border-color:${uvCategoria(u).color}">${Math.round(u)}</i></div>`;

/* Fondo animado según el tiempo: sol, parcial, nubes, lluvia, tormenta o noche */
function tipoCielo(code, esDia) {
  if (code >= 95) return "tormenta";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "lluvia";
  if (code === 3 || code === 45 || code === 48) return "nubes";
  if (!esDia) return "noche";
  if (code === 2) return "parcial";
  return "sol";
}
function htmlCielo(tipo, grande = false) {
  const azar = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  const nubes = (n) => Array.from({ length: n }, (_, k) => `<span class="nube nube-${k + 1}"></span>`).join("");
  const gotas = (n) => Array.from({ length: n }, () => `<i class="gota" style="left:${azar(0, 100)}%;animation-delay:-${azar(0, 1.2)}s;animation-duration:${azar(0.55, 0.95)}s"></i>`).join("");
  const estrellas = (n) => Array.from({ length: n }, () => `<i class="estrella" style="left:${azar(2, 98)}%;top:${azar(4, 70)}%;animation-delay:-${azar(0, 3)}s"></i>`).join("");
  const sol = '<span class="sol"><span class="sol-rayos"></span><span class="sol-disco"></span></span>';
  const k = grande ? 2.5 : 1;
  const html = {
    sol: sol,
    parcial: sol + nubes(1),
    nubes: nubes(3),
    lluvia: nubes(2) + gotas(Math.round(16 * k)),
    tormenta: nubes(3) + gotas(Math.round(20 * k)) + '<span class="destello"></span>',
    noche: '<span class="luna"></span>' + estrellas(Math.round(10 * k))
  }[tipo] || "";
  return html;
}
function ponerCielo(el, tipo, grande) {
  if (el.dataset.tipo === tipo) return; // no se reinicia la animación si no cambió
  el.dataset.tipo = tipo;
  el.className = `cielo cielo-${tipo}${grande ? " cielo-grande" : ""}`;
  el.innerHTML = htmlCielo(tipo, grande);
}

async function cargarClima() {
  if (!S.clima) $("#climaCuerpo").innerHTML = cwHtmlCargando();
  const lat = S.ubicacion ? S.ubicacion.lat.toFixed(3) : TRUJILLO.lat;
  const lng = S.ubicacion ? S.ubicacion.lng.toFixed(3) : TRUJILLO.lng;
  $("#climaLugar").textContent = S.ubicacion ? "Tu ubicación" : TRUJILLO.nombre;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,precipitation,precipitation_probability,uv_index&daily=precipitation_sum,uv_index_max&timezone=America/Lima&forecast_days=2`;
  try {
    const d = await fetchJSON(url);
    const c = d.current;
    if (!c || typeof c.temperature_2m !== "number") throw new Error("Respuesta incompleta");
    const H = d.hourly || {};
    const serie = (k) => Array.isArray(H[k]) ? H[k] : [];
    // Hora actual dentro de la serie horaria
    const idx = serie("time").findIndex((t) => t >= c.time.slice(0, 13) + ":00");
    const desde = idx < 0 ? 0 : idx;
    const probs = serie("precipitation_probability").slice(desde, desde + 6).filter((v) => v !== null);
    const uvAhora = serie("uv_index")[desde];
    const uvMaxHoy = d.daily?.uv_index_max?.[0];
    S.clima = {
      c, desde, hourly: H, consultado: Date.now(), lugar: $("#climaLugar").textContent,
      probMax: probs.length ? Math.max(...probs) : null,
      hoy: d.daily?.precipitation_sum?.[0],
      uv: typeof uvAhora === "number" ? uvAhora : null,
      uvMax: typeof uvMaxHoy === "number" ? uvMaxHoy : null,
      tipo: tipoCielo(c.weather_code, c.is_day !== 0)
    };
    renderClima();
  } catch (e) {
    console.warn("Clima:", e);
    S.clima = null;
    $("#climaCuerpo").innerHTML = cwHtmlError();
    $("#climaFuente").textContent = `Open-Meteo no respondió · ${hora(Date.now())}`;
  }
}
const fmt = (x, u, dec = 1) => (x === null || x === undefined ? "s/d" : `${Number(x).toFixed(dec)}${u}`);

/* ---------------------------------------------------------------------
   CLIMA COMPACTO · opción C3
   Fila con icono animado según el estado del tiempo. Usa las funciones que
   ya existen en app.js: $, ic, esc, fmt, uvCategoria, htmlUvBarra, CODIGOS_WMO.
--------------------------------------------------------------------- */

/* Estado visual a partir del código WMO de Open-Meteo.
   Estados: despejado, parcial, nublado, niebla, llovizna, lluvia-leve, lluvia,
   lluvia-fuerte, tormenta, noche.
   mm = current.precipitation (mm). Sube la intensidad si cae mucha agua:
   >= 2.5 mm pasa de leve a lluvia, >= 7.6 mm pasa de lluvia a fuerte (escala usual de mm/h). */
function cwEstado(code, esDia, mm) {
  let e;
  if (code >= 95) e = "tormenta";
  else if ([51, 53, 55, 56, 57].includes(code)) e = "llovizna";
  else if ([61, 66, 80].includes(code)) e = "lluvia-leve";
  else if ([63, 67, 81].includes(code)) e = "lluvia";
  else if ([65, 82].includes(code)) e = "lluvia-fuerte";
  else if (code === 45 || code === 48) e = "niebla";
  else if (code === 3 || (code >= 71 && code <= 77)) e = "nublado";
  else if (code === 1 || code === 2) e = esDia ? "parcial" : "noche";
  else e = esDia ? "despejado" : "noche";
  if (typeof mm === "number") {
    if (e === "lluvia-leve" && mm >= 2.5) e = "lluvia";
    if (e === "lluvia" && mm >= 7.6) e = "lluvia-fuerte";
  }
  return e;
}

/* Piezas del icono (todo es HTML/CSS/SVG en línea, sin imágenes) */
const CW_NUBE_D = "M13 33a8 8 0 0 1 1-15.9 10 10 0 0 1 19.2 2.3A6.8 6.8 0 0 1 33 33Z";
const cwNube = (cls = "", estilo = "") => `<svg class="cw-nube ${cls}" style="${estilo}" viewBox="0 0 48 48" aria-hidden="true"><path d="${CW_NUBE_D}"/></svg>`;
const cwGota = (x, dur, del = 0, cls = "") => `<i class="cw-g ${cls}" style="--x:${x}px;--dur:${dur}s;--del:${del}s"></i>`;
const cwSalpica = (x, dur, del = 0) => `<i class="cw-s" style="--x:${x}px;--dur:${dur}s;--del:${del}s"></i>`;
const cwRaya = (x, dur, del) => `<i class="cw-raya" style="--x:${x}px;--dur:${dur}s;--del:${del}s"></i>`;
const cwEstrella = (x, y, del) => `<i class="cw-est" style="--x:${x}px;--y:${y}px;--del:${del}s"></i>`;
const cwBruma = (x, y, w, dur, del) => `<i class="cw-bruma" style="--x:${x}px;--y:${y}px;--w:${w}px;--dur:${dur}s;--del:${del}s"></i>`;
const CW_LUNA_D = "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401Z";
const cwLuna = (cls = "") => `<svg class="cw-luna ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${CW_LUNA_D}"/></svg>`;
const cwSol = (cls = "") => `<i class="cw-sol ${cls}"><i class="cw-rayos"></i><i class="cw-disco"></i></i>`;
const CW_RAYO_D = "M13 2 4.5 13.5H10L9 22l9.5-12H13z";

/* Contenido del icono para cada estado. Para cambiar una animación, edita solo su línea. */
const CW_ICONOS = {
  despejado: () => cwSol(),
  parcial: () => cwSol("cw-sol-p") + cwNube("cw-fl", "left:1px;top:6px;width:38px;height:38px"),
  nublado: (noche) => (noche ? cwLuna("cw-luna-ch") : "") +
    cwNube("cw-n-fondo", "left:14px;top:-4px;width:30px;height:30px") + cwNube("cw-fl", "left:2px;top:6px;width:38px;height:38px"),
  niebla: () => cwNube("cw-fl", "top:-3px") + cwBruma(9, 26, 26, 5, 0) + cwBruma(7, 32, 30, 7, -2) + cwBruma(13, 38, 22, 6, -4),
  llovizna: () => cwNube("cw-fl cw-n-claro", "top:-3px") +
    cwGota(14, 2.4, 0, "cw-fina") + cwGota(20, 2.4, 0.8, "cw-fina") + cwGota(26, 2.4, 1.5, "cw-fina") + cwGota(32, 2.4, 0.4, "cw-fina"),
  "lluvia-leve": () => cwNube("cw-fl", "top:-2px") +
    cwGota(18, 1.8, 0) + cwSalpica(18, 1.8, 0) + cwGota(28, 1.8, 0.9) + cwSalpica(28, 1.8, 0.9),
  lluvia: () => cwNube("cw-fl", "top:-2px") +
    cwGota(15, 1.4, 0) + cwSalpica(15, 1.4, 0) + cwGota(23, 1.4, 0.5) + cwSalpica(23, 1.4, 0.5) + cwGota(31, 1.4, 1) + cwSalpica(31, 1.4, 1),
  "lluvia-fuerte": () => cwRaya(14, 0.9, 0) + cwRaya(24, 0.9, 0.3) + cwRaya(34, 0.9, 0.6) + cwRaya(44, 0.9, 0.15) +
    cwNube("cw-fl cw-n-oscura", "top:-2px") +
    cwGota(12, 0.9, 0) + cwSalpica(12, 0.9, 0) + cwGota(18, 1, 0.25) + cwGota(24, 0.9, 0.5) + cwSalpica(24, 0.9, 0.5) +
    cwGota(30, 1, 0.15) + cwGota(36, 0.9, 0.4) + cwSalpica(36, 0.9, 0.4),
  tormenta: () => `<i class="cw-flash"></i>` + cwNube("cw-fl cw-n-oscura", "top:-4px") +
    `<svg class="cw-rayo" viewBox="0 0 24 24" aria-hidden="true"><path d="${CW_RAYO_D}"/></svg>` +
    cwGota(10, 0.8, 0) + cwGota(36, 0.8, 0.4),
  noche: () => cwLuna() + cwEstrella(33, 9, 0) + cwEstrella(38, 22, 1.1) + cwEstrella(8, 8, 2) + cwEstrella(30, 36, 0.6) + cwEstrella(13, 38, 1.7)
};
function cwTile(estado, esDia) {
  const f = CW_ICONOS[estado] || CW_ICONOS.nublado;
  const noche = !esDia && estado !== "noche" ? " cw-noche" : "";
  return `<span class="cw-tile cw-e-${estado}${noche}" aria-hidden="true">${f(!esDia)}</span>`;
}

/* Texto del estado: el de CODIGOS_WMO, pero la lluvia se nombra por intensidad */
const CW_INTENSIDAD = { "lluvia-leve": "Lluvia leve", lluvia: "Lluvia moderada", "lluvia-fuerte": "Lluvia fuerte" };
const cwEtiqueta = (estado, desc0) => (/^Lluvia( fuerte)?$/.test(desc0) && CW_INTENSIDAD[estado]) || desc0;

/* Tarjeta: fila + detalle que se despliega */
function cwHtmlFila(K) {
  const c = K.c, esDia = c.is_day !== 0;
  const estado = cwEstado(c.weather_code, esDia, c.precipitation);
  const desc = cwEtiqueta(estado, (CODIGOS_WMO[c.weather_code] || [null, "—"])[1]);
  const uv = K.uv, cat = uv === null ? null : uvCategoria(uv);
  const prob = K.probMax === null ? "s/d" : `${K.probMax}%`;
  const abierto = !!S.cwAbierto;
  return `
    <button type="button" class="cw-fila" data-cw="alternar" aria-expanded="${abierto}" aria-controls="cwDetalle">
      ${cwTile(estado, esDia)}
      <span class="cw-textos">
        <span class="cw-l1"><span class="cw-t">${fmt(c.temperature_2m, "°", 0)}</span><span class="cw-desc">${esc(desc)}</span></span>
        <span class="cw-l2">${fmt(c.precipitation, " mm")} ahora · ${prob} en 6 h</span>
      </span>
      ${uv === null ? "" : `<span class="cw-uvpill" style="--uvc:${cat.color}"><i></i>UV ${Math.round(uv)}</span>`}
      ${ic("chevron-down", "cw-chev")}
    </button>
    <div id="cwDetalle" class="cw-detalle${abierto ? " abierto" : ""}"><div class="cw-detalle-in">
      <div class="cw-datos">
        <div><span class="k">Lluvia hoy</span><span class="v">${fmt(K.hoy, " mm")}</span></div>
        <div><span class="k">Humedad</span><span class="v">${fmt(c.relative_humidity_2m, "%", 0)}</span></div>
      </div>
      ${uv === null ? "" : `<div class="cw-uv"><span class="k">UV ${esc(cat.nombre.toLowerCase())}</span><span class="v">${Math.round(uv)}</span>${htmlUvBarra(uv)}</div>`}
    </div></div>`;
}
/* Mientras carga: esqueleto con brillo y nube que late */
const cwHtmlCargando = () => `
  <div class="cw-fila cw-quieta" role="status">
    <span class="cw-sr">Cargando clima…</span>
    <span class="cw-tile cw-e-cargando" aria-hidden="true">${cwNube("cw-fl")}</span>
    <span class="cw-textos" aria-hidden="true"><span class="cw-esq" style="width:84px;height:20px"></span><span class="cw-esq" style="width:140px;height:12px;margin-top:6px"></span></span>
    <span class="cw-esq" aria-hidden="true" style="width:52px;height:24px;border-radius:10px"></span>
  </div>`;
/* Si Open-Meteo no responde: toque para reintentar */
const cwHtmlError = () => `
  <button type="button" class="cw-fila" data-cw="reintentar">
    <span class="cw-tile cw-e-error" aria-hidden="true">${cwNube()}<svg class="cw-tachar" viewBox="0 0 46 46"><path d="M12 35 34 11"/></svg></span>
    <span class="cw-textos"><span class="cw-l1"><span class="cw-desc cw-fuerte">Sin datos de clima</span></span><span class="cw-l2">Toca para reintentar</span></span>
  </button>`;
function cwAlternar() {
  S.cwAbierto = !S.cwAbierto;
  $("#climaCuerpo .cw-fila[data-cw='alternar']")?.setAttribute("aria-expanded", String(S.cwAbierto));
  $("#cwDetalle")?.classList.toggle("abierto", S.cwAbierto);
}

function renderClima() {
  const K = S.clima; if (!K) return;
  $("#climaCuerpo").innerHTML = cwHtmlFila(K);
  $("#climaFuente").textContent = `Open-Meteo · ${K.c.time.slice(11, 16)}`;
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
        setTimeout(precalcularEvacuacion, 1500); // ruta de evacuación lista antes de que haga falta
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
  mapa.on("dragstart", () => $("#btnCentrarme").classList.remove("centrado")); // al mover el mapa deja de estar centrado en ti
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
  capas.cauce = L.layerGroup();
  capas.bloqueos = L.layerGroup().addTo(mapa);
  capas.reportes = L.layerGroup().addTo(mapa);
  capas.evac = L.layerGroup().addTo(mapa);
  capas.seguros = L.layerGroup().addTo(mapa);
  // Zonas de refugio oficiales (ANA 2015), con botón "Cómo llegar"
  ZONAS_REFUGIO.forEach((z) => L.marker([z.lat, z.lng], {
    icon: L.divIcon({ className: "", html: `<div class="mk mk-refugio">${ic("shield-check")}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
  }).bindTooltip(`Zona de refugio · ${esc(z.nombre)}`)
    .bindPopup(`<strong>Zona de refugio: ${esc(z.nombre)}</strong><br>${esc(z.area)} · oficial, <a href="${z.url}" target="_blank" rel="noopener">mapa ANA 2015</a>
      <br><span class="cuenta">Ubicación aproximada (±30 m). Confirma su vigencia con Defensa Civil.</span>
      <br><button class="btn btn-primario btn-chico" data-refugio="${z.id}">${ic("route")} Cómo llegar</button>`)
    .addTo(capas.seguros));
  mapa.attributionControl.addAttribution('Rutas: <a href="https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen" target="_blank" rel="noopener">FOSSGIS</a> · Elevación: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>');
  mapa.getContainer().addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-refugio]");
    if (b) { ev.preventDefault(); mostrarEvacuacion({ refugioId: b.dataset.refugio }); }
  });
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
  if (r.gestion === "atendido") return "atendido"; // resuelto por la autoridad: deja de mostrarse a los vecinos
  const c = r.confirmaciones || 0, n = r.negaciones || 0;
  if (c + n >= VOTOS_MIN && n > c) return "descartado";
  const ultimo = Math.max(r.creado || 0, r.ultimaConfirmacion || 0, r.verificadoEn || 0);
  if (ahora() - ultimo > REPORTE_CADUCA_MS) return "caducado";
  if (r.verificadoAutoridad || c >= VOTOS_MIN) return "confirmado";
  return "sinValidar";
}
const NOMBRE_ESTADO = { sinValidar: "Sin validar", confirmado: "Confirmado", descartado: "Descartado", caducado: "Caducado", atendido: "Atendido" };
const NOMBRE_GESTION = { pendiente: "Por atender", en_atencion: "En atención", atendido: "Atendido" };
const gestionDe = (r) => r.gestion || "pendiente";

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
    if (est === "descartado" || est === "caducado" || est === "atendido") return; // se ocultan
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
/* Tarjeta con más detalle para la hoja del mapa: descripción, distancia, votos y gestión */
function htmlItemDetalle(x) {
  const T = TIPOS_REPORTE[x.r.tipo] || TIPOS_REPORTE.otro;
  const badge = x.r.verificadoAutoridad ? ["autoridad", "Verificado"] : x.est === "confirmado" ? ["confirmado", "Confirmado"] : ["sinValidar", "Sin validar"];
  const dist = x.dist === null ? "" : x.dist < 1000 ? `${Math.round(x.dist / 10) * 10} m` : `${(x.dist / 1000).toFixed(1)} km`;
  const g = gestionDe(x.r);
  return `<li><button class="item-reporte item-detalle" data-rep="${esc(x.id)}">
    <span class="item-foto" data-foto-item="${esc(x.id)}">${ic(T.icono)}</span>
    <span class="item-cuerpo">
      <span class="item-titulo">${esc(T.nombre)}${trazoDe(x.r) ? ` (tramo de ${Math.round(x.r.largo || 0)} m)` : ""}</span>
      ${x.r.descripcion ? `<span class="item-desc">${esc(x.r.descripcion)}</span>` : ""}
      <span class="item-meta">${dist ? `${ic("map-pin")}${dist} · ` : ""}${hace(x.r.creado)} · ${x.r.confirmaciones || 0} confirman</span>
      <span class="item-badges"><span class="estado-badge ${badge[0]}">${badge[1]}</span>${g === "en_atencion" ? '<span class="estado-badge gestion">La autoridad lo atiende</span>' : ""}</span>
    </span>
    ${ic("chevron-right", "item-ir")}</button></li>`;
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
  // Hoja del mapa: solo reportes a menos de 2 km de la persona (no los de toda la ciudad)
  const lm = $("#listaReportesMapa");
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  $("#hojaAviso").hidden = !!S.ubicacion;
  $(".hoja-mapa .filtros").hidden = !S.ubicacion;
  if (!S.ubicacion) {
    $("#resumenReportes").textContent = "activa tu ubicación";
    lm.innerHTML = "";
    return;
  }
  const cercaLista = items.filter((x) => x.dist !== null && x.dist <= RADIO_LISTA_M);
  $("#resumenReportes").textContent = cercaLista.length ? `${pl(cercaLista.length, "cerca de ti", "cerca de ti")} · a menos de ${RADIO_LISTA_M / 1000} km` : `ninguno a menos de ${RADIO_LISTA_M / 1000} km`;
  const fil = cercaLista.filter((x) => filtroMapa === "todos" || x.est === filtroMapa);
  lm.innerHTML = fil.length ? fil.map(htmlItemDetalle).join("") : `<li class="lista-vacia">${cercaLista.length ? "No hay reportes con este filtro." : `No hay reportes a menos de ${RADIO_LISTA_M / 1000} km de ti.`}</li>`;
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
    ${gestionDe(r) === "en_atencion" ? `<p class="gestion-nota">${ic("shield-user")}La autoridad lo está atendiendo</p>` : ""}
    <p class="pregunta">¿Sigue este problema?</p>
    <div class="votos">
      <button class="si" data-voto="1" data-id="${esc(id)}" ${dis}>${ic("check")}Confirmar</button>
      <button data-voto="-1" data-id="${esc(id)}" ${dis}>${ic("x")}Ya no está</button>
    </div>
    <p class="cuenta">${r.confirmaciones || 0} confirman · ${r.negaciones || 0} dicen que ya no está</p>
    ${nota ? `<p class="cuenta">${nota}</p>` : ""}
  </div>`;
}

/* Centra el mapa en la persona. Al entrar a la pestaña usa la última ubicación conocida
   de inmediato y luego la actualiza; con el botón la vuelve a pedir. */
async function centrarEnMi(alEntrar) {
  if (!mapa) return;
  const ir = (u) => { if (u && mapa) mapa.setView([u.lat, u.lng], Math.max(mapa.getZoom(), 16), { animate: !alEntrar }); };
  if (alEntrar && S.ubicacion) ir(S.ubicacion);
  $("#btnCentrarme").classList.add("buscando");
  const u = await pedirUbicacion({ silencioso: alEntrar });
  $("#btnCentrarme").classList.remove("buscando");
  if (u) { ir(u); $("#btnCentrarme").classList.add("centrado"); }
  else if (!alEntrar) toast("No se pudo usar tu ubicación. Revisa el permiso del navegador.");
}

function pintarYo() {
  if (!mapa || !S.ubicacion) return;
  const ll = [S.ubicacion.lat, S.ubicacion.lng];
  if (!marcadorYo) {
    marcadorYo = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="mk-yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 })
      .bindTooltip("Tú estás aquí").addTo(mapa);
  } else marcadorYo.setLatLng(ll);
}

/* ---------- Evacuación: zona de refugio oficial (ANA 2015) o zona alta calculada con la topografía ----------
   1. Si estás a más de 1 km del cauce: no se propone evacuar por la quebrada (se puede pedir el refugio más cercano).
   2. Si hay una zona de refugio ANA de tu mismo lado del cauce a ≤ 1,5 km a pie: ruta a esa zona.
   3. Si no: zona más alta cercana, del mismo lado del cauce, ≥ 400 m de él, ≥ 20 m más alta que el cauce y con calle.
   4. Sin red: última ruta guardada (si estás a < 200 m de donde se calculó) o dirección para alejarse del cauce.
   Rutas: Valhalla de FOSSGIS (a pie, evitando una franja de 120 m del cauce); respaldo OSRM a pie (FOSSGIS).
   Ambos piden como máximo 1 consulta por segundo y no garantizan disponibilidad.
   Elevación: AWS Terrain Tiles (Terrarium, SRTM ~30 m), sin clave. */
const RAD = Math.PI / 180, R_TIERRA = 6371000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const moverLL = (p, este, norte) => [p[0] + norte / (R_TIERRA * RAD), p[1] + este / (R_TIERRA * RAD * Math.cos(p[0] * RAD))];

/* Punto más cercano de una línea a p: distancia (m), punto (ll), segmento y lado (+1 / −1; 0 si está encima) */
function puntoMasCercanoEnCauce(p, linea = CAUCE_REFERENCIAL) {
  const cosLat = Math.cos(p[0] * RAD);
  const toXY = (q) => [(q[1] - p[1]) * RAD * cosLat * R_TIERRA, (q[0] - p[0]) * RAD * R_TIERRA];
  let mejor = { d: Infinity, xy: null, seg: null };
  for (let i = 0; i < linea.length - 1; i++) {
    const a = toXY(linea[i]), b = toXY(linea[i + 1]);
    const ab = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, (-a[0] * ab[0] - a[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
    const q = [a[0] + t * ab[0], a[1] + t * ab[1]];
    const d = Math.hypot(q[0], q[1]);
    if (d < mejor.d) mejor = { d, xy: q, seg: ab };
  }
  const cruz = mejor.seg[1] * mejor.xy[0] - mejor.seg[0] * mejor.xy[1];
  const lado = mejor.d < 30 ? 0 : Math.sign(cruz);
  return { ...mejor, cosLat, lado, ll: moverLL(p, mejor.xy[0], mejor.xy[1]) };
}

/* ---- Elevación: AWS Terrain Tiles (formato Terrarium) decodificados en un canvas ---- */
const ELEV_Z = 12;                       // z12 = dato SRTM nativo (~38 m por píxel en Trujillo)
const ELEV_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";
const _tilesElev = {};
function tileElevacion(k) {
  if (!_tilesElev[k]) {
    _tilesElev[k] = new Promise((ok, fail) => {
      const img = new Image();
      const t = setTimeout(() => { img.src = ""; fail(new Error("Tiempo agotado: tile " + k)); }, 10000);
      img.crossOrigin = "anonymous";     // el bucket responde Access-Control-Allow-Origin: *
      img.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 256;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          ok(g.getImageData(0, 0, 256, 256).data);
        } catch (e) { fail(e); }
      };
      img.onerror = () => { clearTimeout(t); fail(new Error("No cargó el tile " + k)); };
      img.src = `${ELEV_URL}${k}.png`;
    }).catch((e) => { delete _tilesElev[k]; throw e; });
  }
  return _tilesElev[k];
}
async function elevacion(p) {
  const n = 2 ** ELEV_Z;
  const xf = ((p[1] + 180) / 360) * n;
  const yf = ((1 - Math.asinh(Math.tan(p[0] * RAD)) / Math.PI) / 2) * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  const d = await tileElevacion(`${ELEV_Z}/${x}/${y}`);
  const px = Math.min(255, Math.floor((xf - x) * 256)), py = Math.min(255, Math.floor((yf - y) * 256));
  const i = (py * 256 + px) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;   // fórmula Terrarium (m s. n. m.)
}
const elevaciones = (puntos) => Promise.all(puntos.map(elevacion));

/* ---- Rutas a pie (FOSSGIS). Máximo 1 consulta por segundo entre todas. ---- */
const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";
const OSRM_PIE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/";
let _turnoRuta = 0;
async function esperarTurnoRuta() {
  const espera = _turnoRuta + 1100 - Date.now();
  _turnoRuta = Math.max(Date.now(), _turnoRuta + 1100);
  if (espera > 0) await sleep(espera);
}
function decodificarPolyline6(s) {
  let i = 0, lat = 0, lng = 0; const out = [];
  while (i < s.length) {
    let b, sh = 0, r = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    sh = 0; r = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}
/* Franja a evitar alrededor del cauce: UN polígono continuo por cada tramo seguido (Valhalla acepta como máximo
   10 km de perímetro sumando todos los polígonos; el tramo alto de ~3,6 km da ~7,7 km). Se omiten los segmentos que
   tocan el origen o el destino (si no, Valhalla no encuentra salida). Formato Valhalla: anillos de [lng, lat]. */
function franjaEvitar(linea, anchoM, libres) {
  const tramos = [];
  let actual = [];
  for (let i = 0; i < linea.length - 1; i++) {
    const a = linea[i], b = linea[i + 1];
    const libre = libres.some((q) => puntoMasCercanoEnCauce(q, [a, b]).d < anchoM + 80);
    if (libre) { if (actual.length > 1) tramos.push(actual); actual = []; continue; }
    if (!actual.length) actual.push(a);
    actual.push(b);
  }
  if (actual.length > 1) tramos.push(actual);
  return tramos.map((pts) => {
    const m = pts[Math.floor(pts.length / 2)], cosLat = Math.cos(m[0] * RAD);
    const xy = pts.map((q) => [(q[1] - m[1]) * RAD * cosLat * R_TIERRA, (q[0] - m[0]) * RAD * R_TIERRA]);
    const dir = (k) => { const a = xy[Math.max(0, k - 1)], b = xy[Math.min(xy.length - 1, k + 1)]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    const izq = [], der = [];
    xy.forEach((P, k) => {
      const u = dir(k), n = [-u[1], u[0]];
      const ext = k === 0 ? -anchoM / 2 : k === xy.length - 1 ? anchoM / 2 : 0;   // se alarga un poco en los extremos
      const B = [P[0] + u[0] * ext, P[1] + u[1] * ext];
      izq.push([B[0] + n[0] * anchoM, B[1] + n[1] * anchoM]);
      der.push([B[0] - n[0] * anchoM, B[1] - n[1] * anchoM]);
    });
    const anillo = izq.concat(der.reverse());
    anillo.push(anillo[0]);
    return anillo.map(([x, y]) => { const ll = moverLL(m, x, y); return [Number(ll[1].toFixed(6)), Number(ll[0].toFixed(6))]; });
  });
}
function cuadradoEvitar(c, ladoM) {
  const h = ladoM / 2;
  return [[[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]].map(([x, y]) => { const ll = moverLL(c, x, y); return [Number(ll[1].toFixed(6)), Number(ll[0].toFixed(6))]; })];
}
async function postJSON(url, cuerpo, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "HTTP " + r.status); e.status = r.status; throw e; }
    return j;
  } finally { clearTimeout(t); }
}
/* Ruta a pie con Valhalla evitando polígonos. null = no hay ruta; lanza error si el servicio no responde. */
async function rutaValhalla(a, b, evitar) {
  await esperarTurnoRuta();
  let j;
  try {
    j = await postJSON(VALHALLA_URL, {
      locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }],
      costing: "pedestrian", units: "kilometers", directions_type: "none",
      ...(evitar && evitar.length ? { exclude_polygons: evitar } : {})
    });
  } catch (e) {
    if (e.status === 400 && /no path|no suitable edges/i.test(e.message)) return null;   // de verdad no hay ruta
    throw e;   // cualquier otro error: se usa el respaldo (OSRM a pie)
  }
  if (!j.trip || !j.trip.legs || !j.trip.legs[0]) return null;
  const trazo = simplificar(decodificarPolyline6(j.trip.legs[0].shape).map((q) => q.map((v) => Number(v.toFixed(6)))));
  return { trazo, largo: j.trip.summary.length * 1000, min: j.trip.summary.time / 60, metodo: "valhalla", evitaPeligro: !!(evitar && evitar.length) };
}
async function rutaOSRMPie(a, b) {
  await esperarTurnoRuta();
  const j = await fetchJSON(`${OSRM_PIE_URL}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, 8000);
  const r = j.routes && j.routes[0];
  if (j.code !== "Ok" || !r) return null;
  const trazo = simplificar(r.geometry.coordinates.map(([x, y]) => [Number(y.toFixed(6)), Number(x.toFixed(6))]));
  return { trazo, largo: r.distance, min: r.duration / 60, metodo: "osrm", evitaPeligro: false };
}
/* Valhalla evitando el peligro; si el servicio falla, OSRM a pie (no evita el cauce). */
async function rutaAPie(a, b, evitar) {
  try { return await rutaValhalla(a, b, evitar); }
  catch (e) { console.warn("Valhalla:", e); }
  try { return await rutaOSRMPie(a, b); }
  catch (e) { console.warn("OSRM a pie:", e); return undefined; }   // undefined = sin servicio
}

/* El peligro del que hay que alejarse: el cauce, o un huaico verificado por la autoridad */
function peligroActual() {
  const e = estadoEfectivo();
  if (esPorReporte(e) && e.reporte && Number.isFinite(e.reporte.lat)) {
    const h = [e.reporte.lat, e.reporte.lng];
    return {
      tipo: "huaico", nombre: "huaico", clave: `h:${h[0].toFixed(4)},${h[1].toFixed(4)}`,
      cerca: (q) => { const d = distM(q, h); return { d, ll: h, lado: 0 }; },
      evitar: (libres) => libres.some((q) => distM(q, h) < 180) ? [] : cuadradoEvitar(h, 200)
    };
  }
  return {
    tipo: "cauce", nombre: "cauce", clave: "cauce-v2",
    cerca: (q) => puntoMasCercanoEnCauce(q),
    // La franja se aplica al tramo alto (trazado sobre el mapa ANA); aguas abajo el trazado es solo aproximado.
    evitar: (libres) => franjaEvitar(CAUCE_TRAMO_ALTO, EVAC.franjaCauceM, libres)
  };
}

/* Calcula la evacuación desde p. Nunca inventa: si no hay datos lo indica en el resultado. */
async function calcularEvacuacion(p, { refugioId = null } = {}) {
  const pel = peligroActual();
  const base = { v: 2, origen: p, ts: Date.now(), peligro: pel.tipo, clave: pel.clave + (refugioId ? ":" + refugioId : "") };
  const pc = pel.cerca(p);
  base.distPeligro = Math.round(pc.d);
  if (!refugioId && pel.tipo === "cauce" && pc.d > EVAC.cercaCauceM) return { ...base, tipo: "lejos" };

  // Altitud de la persona (para mostrarla; si falla, se sigue sin ella)
  let elevOrigen = null;
  try { elevOrigen = await elevacion(p); } catch (e) { console.warn("Elevación:", e); }
  base.elevOrigen = elevOrigen;

  // 1) Zona de refugio oficial cercana
  const refugios = (refugioId ? ZONAS_REFUGIO.filter((z) => z.id === refugioId) : ZONAS_REFUGIO)
    .map((z) => ({ z, recta: distM(p, [z.lat, z.lng]) }))
    .filter((x) => refugioId || x.recta <= EVAC.refugioMaxM)
    // Nunca proponer un refugio al otro lado del cauce (habría que cruzarlo)
    .filter((x) => refugioId || pel.tipo !== "cauce" || pc.lado === 0 || pel.cerca([x.z.lat, x.z.lng]).lado === pc.lado)
    .sort((a, b) => a.recta - b.recta);
  let sinServicio = false, mejorRef = null;
  for (const { z } of refugios) {
    const dz = [z.lat, z.lng];
    const r = await rutaAPie(p, dz, pel.evitar([p, dz]));
    if (r === undefined) { sinServicio = true; break; }
    if (r && (!mejorRef || r.largo < mejorRef.ruta.largo)) mejorRef = { z, ruta: r };
  }
  if (mejorRef && (refugioId || mejorRef.ruta.largo <= EVAC.refugioMaxM)) {
    let elevDestino = null;
    try { elevDestino = await elevacion([mejorRef.z.lat, mejorRef.z.lng]); } catch {}
    return { ...base, tipo: "refugio", destino: { ...mejorRef.z }, ruta: mejorRef.ruta, elevDestino };
  }
  // Sin servicio de rutas pero con un refugio cercano de tu lado: se marca la dirección en línea recta
  if (sinServicio && !refugioId && refugios.length) {
    const z = refugios[0].z;
    let elevDestino = null;
    try { elevDestino = await elevacion([z.lat, z.lng]); } catch {}
    return { ...base, tipo: "refugio", destino: { ...z }, ruta: lineaRecta(p, [z.lat, z.lng]), elevDestino, sinServicio };
  }
  if (refugioId) {   // refugio pedido a mano y sin ruta por calles: se muestra la dirección en línea recta
    const z = refugios[0].z;
    return { ...base, tipo: "refugio", destino: { ...z }, ruta: lineaRecta(p, [z.lat, z.lng]), elevDestino: null, sinServicio };
  }

  // 2) Zona alta: mismo lado del peligro, más lejos que tú, ≥ 400 m y ≥ 20 m más alta que su punto más cercano del cauce
  let cands = [];
  for (const d of [300, 500, 750, 1000, 1300]) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const q = moverLL(p, Math.cos(a) * d, Math.sin(a) * d);
      const c = pel.cerca(q);
      if (c.d < EVAC.altaMinCauceM || c.d < pc.d + 100) continue;
      if (pel.tipo === "cauce" && pc.lado !== 0 && c.lado !== pc.lado) continue;   // no cruzar el cauce
      cands.push({ q, d, c });
    }
  }
  let sinElevacion = false;
  if (cands.length) {
    try {
      const eq = await elevaciones(cands.map((x) => x.q));
      const ec = await elevaciones(cands.map((x) => x.c.ll));
      cands.forEach((x, i) => { x.elev = eq[i]; x.desnivel = eq[i] - ec[i]; });
      cands = cands.filter((x) => x.desnivel >= EVAC.altaMinDesnivelM);
    } catch (e) { console.warn("Elevación:", e); sinElevacion = true; cands = []; }
  }
  // Las 3 más cercanas, separadas al menos 250 m entre sí
  cands.sort((a, b) => a.d - b.d || b.desnivel - a.desnivel);
  const elegidas = [];
  for (const x of cands) { if (elegidas.every((y) => distM(x.q, y.q) >= 250)) elegidas.push(x); if (elegidas.length === 3) break; }
  let mejorAlta = null;
  if (!sinServicio) {
    for (const x of elegidas) {
      const r = await rutaAPie(p, x.q, pel.evitar([p, x.q]));
      if (r === undefined) { sinServicio = true; break; }
      if (!r || distM(r.trazo[r.trazo.length - 1], x.q) > EVAC.altaCalleMaxM) continue;   // no se llega por calle
      if (!mejorAlta || r.largo < mejorAlta.ruta.largo) mejorAlta = { x, ruta: r };
    }
  }
  if (!mejorAlta && sinServicio && elegidas.length) {   // sin rutas, pero sí relieve: dirección a la zona alta
    const x = elegidas[0];
    mejorAlta = { x, ruta: lineaRecta(p, x.q) };
  }
  if (mejorAlta) {
    const { x } = mejorAlta;
    return {
      ...base, tipo: "alta", ruta: mejorAlta.ruta, elevDestino: x.elev, sinServicio,
      destino: { lat: x.q[0], lng: x.q[1], desnivel: Math.round(x.desnivel), distPeligro: Math.round(x.c.d) }
    };
  }

  // 3) Sin zona alta alcanzable: alejarse del peligro ~700 m, en perpendicular
  let v;
  if (pc.xy && pc.d > 25) v = [-pc.xy[0], -pc.xy[1]];          // desde el cauce hacia ti, y más allá
  else if (pc.seg) v = [-pc.seg[1], pc.seg[0]];                 // encima del cauce: perpendicular
  else v = [(p[1] - pc.ll[1]) * RAD * Math.cos(p[0] * RAD) * R_TIERRA, (p[0] - pc.ll[0]) * RAD * R_TIERRA];   // huaico
  if (!Math.hypot(v[0], v[1])) v = [0, 1];
  const len = Math.hypot(v[0], v[1]);
  const lejos = moverLL(p, (v[0] / len) * 700, (v[1] / len) * 700);
  let ruta = null;
  if (!sinServicio) { const r = await rutaAPie(p, lejos, pel.evitar([p, lejos])); if (r) ruta = r; else if (r === undefined) sinServicio = true; }
  return {
    ...base, tipo: "alejarse", ruta: ruta || lineaRecta(p, lejos), destino: { lat: lejos[0], lng: lejos[1] },
    sinElevacion, sinServicio, sinZonaAlta: !sinElevacion && !sinServicio
  };
}
function lineaRecta(a, b) {
  return { trazo: [a, b].map((q) => q.map((v) => Number(v.toFixed(6)))), largo: distM(a, b), min: distM(a, b) / 75, metodo: "recta", evitaPeligro: false };
}

/* Resultado guardado en el celular: sirve sin red si sigues a menos de 200 m de donde se calculó */
const CLAVE_EVAC = "previunt_evac";
function evacGuardada(p, clave) {
  const g = lsGet(CLAVE_EVAC, null);
  if (!g || g.v !== 2 || !p || !g.origen) return null;
  if (clave && g.clave !== clave) return null;
  return distM(p, g.origen) <= EVAC.moverseM ? g : null;
}
let _evacEnCurso = null;
async function obtenerEvacuacion(p, opciones = {}) {
  const pel = peligroActual();
  const clave = pel.clave + (opciones.refugioId ? ":" + opciones.refugioId : "");
  const g = evacGuardada(p, clave);
  if (g && !opciones.forzar) return g;
  if (_evacEnCurso && !opciones.refugioId) return _evacEnCurso;
  const tarea = (async () => {
    if (navigator.onLine === false && g) return { ...g, guardada: true };
    const r = await calcularEvacuacion(p, opciones);
    // Si no hubo servicio y había una ruta buena guardada, se prefiere la guardada
    if ((r.sinServicio || r.sinElevacion) && g && g.tipo !== "alejarse") return { ...g, guardada: true };
    if (!r.sinServicio && !opciones.refugioId) lsSet(CLAVE_EVAC, r);
    return r;
  })();
  if (!opciones.refugioId) _evacEnCurso = tarea;
  try { return await tarea; } finally { if (!opciones.refugioId) _evacEnCurso = null; }
}
/* Se calcula en segundo plano al conocer la ubicación, para que en una emergencia aparezca al instante */
function precalcularEvacuacion() {
  if (!S.ubicacion || _evacEnCurso) return;
  const p = [S.ubicacion.lat, S.ubicacion.lng];
  if (evacGuardada(p, peligroActual().clave)) return;
  obtenerEvacuacion(p).then(() => renderInicio()).catch((e) => console.warn("Evacuación:", e));
}

const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const fmtMin = (min) => `${Math.max(1, Math.round(min))} min`;
async function mostrarEvacuacion(opciones = {}) {
  cerrarAlarma();
  irATab("mapa");
  if (!mapa) return;
  $("#hojaMapa").dataset.abierta = "false";
  mapa.closePopup();
  if (!S.ubicacion) await pedirUbicacion();
  capas.evac.clearLayers();
  capas.cauce.addTo(mapa);
  $('.chip[data-capa="cauce"]')?.setAttribute("aria-pressed", "true");
  $("#panelEvac").hidden = false;
  const pel = peligroActual();
  if (!S.ubicacion) {
    $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("locate-fixed")} Activa tu ubicación</p><p>Para calcular tu ruta necesitamos saber dónde estás. Mientras tanto: aléjate hacia los costados de la quebrada y sube, nunca camines a lo largo del cauce.</p>`;
    mapa.fitBounds(L.polyline(CAUCE_REFERENCIAL).getBounds(), { padding: [30, 30], animate: false });
    return;
  }
  const p = [S.ubicacion.lat, S.ubicacion.lng];
  const guardada = evacGuardada(p, pel.clave + (opciones.refugioId ? ":" + opciones.refugioId : ""));
  if (!guardada) $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("route")} Calculando tu ruta…</p><p class="evac-nota">Buscando zonas de refugio y zonas altas cerca de ti.</p>`;
  let r;
  try { r = await obtenerEvacuacion(p, opciones); }
  catch (e) {
    console.error("Evacuación:", e);
    $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("circle-alert")} No se pudo calcular la ruta</p><p>Aléjate hacia los costados de la quebrada y sube. Si no puedes salir, sube al piso más alto.</p>`;
    return;
  }
  if ($("#panelEvac").hidden) return;   // la persona cerró el panel mientras se calculaba
  dibujarEvacuacion(r, p);
  renderInicio();
}

function dibujarEvacuacion(r, p) {
  capas.evac.clearLayers();
  const del = r.peligro === "huaico" ? "huaico" : "cauce";
  if (r.tipo === "lejos") {
    $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("circle-check")} Estás a ${fmtDist(r.distPeligro)} del cauce</p>
      <p>No estás junto a la quebrada. Si llueve fuerte, aléjate de las calles por donde baja el agua y sigue las indicaciones oficiales.</p>
      <button class="btn btn-secundario btn-chico" id="btnRefugioCercano">${ic("shield-check")} Ver la zona de refugio más cercana</button>
      <p class="evac-nota">Distancia al trazado referencial del cauce.</p>`;
    $("#btnRefugioCercano").onclick = () => {
      const z = ZONAS_REFUGIO.slice().sort((a, b) => distM(p, [a.lat, a.lng]) - distM(p, [b.lat, b.lng]))[0];
      mostrarEvacuacion({ refugioId: z.id });
    };
    mapa.setView(p, 14, { animate: false });
    return;
  }
  const ruta = r.ruta;
  const recta = ruta.metodo === "recta";
  L.polyline(ruta.trazo, { color: "#fff", weight: 10, opacity: 0.9 }).addTo(capas.evac);
  L.polyline(ruta.trazo, { color: "#1565C0", weight: 6, dashArray: recta ? "10 8" : null }).addTo(capas.evac);
  const fin = r.tipo === "refugio" || r.tipo === "alta" ? [r.destino.lat, r.destino.lng] : ruta.trazo[ruta.trazo.length - 1];
  const icono = r.tipo === "refugio" ? "shield-check" : r.tipo === "alta" ? "arrow-up" : "navigation";
  const etiqueta = r.tipo === "refugio" ? `Zona de refugio: ${r.destino.nombre} (ANA 2015)`
    : r.tipo === "alta" ? `Zona alta (calculada, referencial)` : `Dirección para alejarte del ${del}`;
  L.marker(fin, { icon: L.divIcon({ className: "", html: `<div class="mk mk-destino">${ic(icono)}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 900 })
    .bindTooltip(etiqueta).addTo(capas.evac);

  const alt = (v) => `~${Math.round(v)} m`;
  let que;
  if (r.tipo === "refugio") {
    que = `<p><strong>Zona de refugio: ${esc(r.destino.nombre)}</strong><br>Oficial · <a href="${r.destino.url}" target="_blank" rel="noopener">mapa ANA 2015</a> · ubicación aprox.</p>`;
  } else if (r.tipo === "alta") {
    que = `<p><strong>Zona alta cercana</strong>: ~${r.destino.desnivel} m sobre el ${del}, a ${fmtDist(r.destino.distPeligro)} de él<br><span class="tag-ref">Calculada · no es un punto oficial</span></p>`;
  } else if (r.sinElevacion || r.sinServicio) {
    que = `<p><strong>Aléjate del ${del}</strong> en esta dirección${recta ? " (sin ruta por calles)" : ""}. No hay datos de ${r.sinElevacion ? "elevación" : "rutas"} ahora mismo.</p>`;
  } else {
    que = `<p><strong>Aléjate del ${del}</strong> por esta ruta. No hay una zona más alta cerca: si no puedes salir, sube al piso más alto.</p>`;
  }
  if (recta && (r.tipo === "refugio" || r.tipo === "alta")) que += `<p class="evac-aviso">${ic("triangle-alert")} Sin ruta por calles: la línea marca solo la dirección.</p>`;
  const altitud = Number.isFinite(r.elevOrigen) && Number.isFinite(r.elevDestino)
    ? `<p class="evac-alt">${ic("mountain")} Tú ${alt(r.elevOrigen)} → destino ${alt(r.elevDestino)} s. n. m.</p>` : "";
  const aviso = !ruta.evitaPeligro && !recta
    ? `<p class="evac-aviso">${ic("triangle-alert")} Esta ruta no evita el ${del}: no camines por él ni lo cruces.</p>` : "";
  const servicio = recta ? "línea recta" : ruta.metodo === "valhalla" ? "Valhalla (FOSSGIS)" : "OSRM a pie (FOSSGIS)";
  const fuentes = [`Ruta: ${servicio}`, Number.isFinite(r.elevDestino) || r.tipo === "alta" ? "Elevación: SRTM ~30 m (AWS)" : null,
    `calculada ${hora(r.ts)}${r.guardada ? " (guardada, sin conexión)" : ""}`].filter(Boolean).join(" · ");
  $("#textoEvac").innerHTML = `<p class="evac-titulo">${ic("footprints")} ${fmtDist(ruta.largo)} · ${fmtMin(ruta.min)} a pie</p>${que}${altitud}${aviso}
    <p class="evac-nota">Referencial: sigue a Defensa Civil y los brigadistas.<br>${fuentes}</p>`;
  const cerca = peligroActual().cerca(p);   // se incluye el punto del cauce más cercano, para ver de qué te alejas
  encuadrarEvacuacion(L.latLngBounds([p, fin].concat(ruta.trazo, cerca.d < EVAC.cercaCauceM ? [cerca.ll] : [])));
}
/* Encuadra la ruta dejando libre el panel de arriba, los botones de la derecha y la hoja de abajo */
function encuadrarEvacuacion(limites) {
  const panel = $("#panelEvac");
  const arriba = panel.hidden ? 70 : panel.offsetTop + panel.offsetHeight + 24;
  mapa.fitBounds(limites, { paddingTopLeft: [36, arriba], paddingBottomRight: [70, 190], maxZoom: 17, animate: false });
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

/* Modo autoridad: se activa con ?admin=1 o 5 toques en el logo y queda guardado en este celular.
   Agrega la pestaña "Control" (estado de la quebrada y gestión de reportes). */
const esAutoridad = () => lsGet("previunt_autoridad", false) === true;
let filtroGestion = "pendiente";
function aplicarModoAutoridad() {
  const on = esAutoridad();
  document.body.classList.toggle("autoridad", on);
  $(".nav-autoridad").hidden = !on;
  $("#badgeAutoridad").hidden = !on;
  if (!on && $("#tab-control").classList.contains("activa")) irATab("inicio");
}
function abrirAdmin() { lsSet("previunt_autoridad", true); aplicarModoAutoridad(); irATab("control"); renderAdmin(); }

function renderAdmin() {
  if (!esAutoridad()) return;
  const e = estadoEfectivo();
  const eb = estadoBase();
  $$(".btn-nivel").forEach((b) => b.classList.toggle("actual", eb.nivel === Number(b.dataset.nivel) && eb.fuente !== "sinReportes"));
  $("#chkProximidad").checked = proximidadActiva();
  const al = alertaPorReportes();
  $("#btnDemoOff").hidden = !S.demo?.activo;
  $("#adminEstadoDemo").textContent = (S.demo?.activo ? `Simulación activa: ${NIVELES[S.demo.nivel]?.corto || S.demo.nivel}` : eb.fuente === "autoridad" ? `Estado oficial: ${NIVELES[eb.nivel].corto} · ${eb.cita || "sin fuente"}` : "Sin estado oficial publicado.")
    + (al ? ` · Aviso "Cuidado al salir" activo por un huaico reportado` : "");
  $("#adminConexion").innerHTML = Datos.modo === "firebase"
    ? `Conectado a Firebase · usuario anónimo <code>${esc(String(Datos.uid).slice(0, 8))}…</code>`
    : `Modo LOCAL (sin Firebase): datos solo en este navegador · usuario <code>${esc(String(Datos.uid).slice(0, 8))}…</code>`;
  const s = S.sensor;
  $("#adminSensor").innerHTML = s
    ? `Último estado oficial: ${esc(NIVELES[s.nivel]?.corto ?? s.nivel)} · ${esc(s.fuente || "sin fuente")} · ${fechaHora(Number(s.actualizado))}`
    : "Aún no se publicó un estado oficial.";

  renderControlReportes();
}

/* Gestión de reportes para la autoridad: por atender, en atención, atendidos */
function renderControlReportes() {
  const todos = Object.entries(S.reportes || {}).filter(([, r]) => r && typeof r.lat === "number");
  const cuenta = { pendiente: 0, en_atencion: 0, atendido: 0 };
  todos.forEach(([, r]) => { cuenta[gestionDe(r)]++; });
  $("#ctlResumen").textContent = `${cuenta.pendiente} por atender`;
  $$(".ctl-filtros .filtro").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.gestion === filtroGestion));
    const n = b.dataset.gestion === "todos" ? todos.length : cuenta[b.dataset.gestion];
    b.textContent = `${{ pendiente: "Por atender", en_atencion: "En atención", atendido: "Atendidos", todos: "Todos" }[b.dataset.gestion]} (${n})`;
  });
  const lista = todos
    .filter(([, r]) => filtroGestion === "todos" || gestionDe(r) === filtroGestion)
    .sort((a, b) => (b[1].creado || 0) - (a[1].creado || 0));
  const votosSim = lsGet("previunt_votosSim", false) === true;
  const cont = $("#adminReportes");
  cont.innerHTML = lista.length ? lista.map(([id, r]) => {
    const T = TIPOS_REPORTE[r.tipo] || TIPOS_REPORTE.otro;
    const est = estadoReporte(r), g = gestionDe(r);
    const comunidad = est === "atendido" ? "" : `<span class="estado-badge ${est === "confirmado" ? "confirmado" : "sinValidar"}">${NOMBRE_ESTADO[est]}</span>`;
    const accionG = g === "pendiente" ? `<button class="prim" data-acc="atencion" data-id="${esc(id)}">${ic("clipboard-list")}Atender</button>`
      : g === "en_atencion" ? `<button class="prim" data-acc="atendido" data-id="${esc(id)}">${ic("check-check")}Marcar atendido</button>`
      : `<button data-acc="reabrir" data-id="${esc(id)}">Reabrir</button>`;
    return `<li class="ctl-item gestion-${g}">
      <div class="ctl-fila">
        <span class="item-foto" data-foto-item="${esc(id)}">${ic(T.icono)}</span>
        <div class="ctl-info">
          <strong>${esc(T.nombre)}${trazoDe(r) ? ` (tramo de ${Math.round(r.largo || 0)} m)` : ""}</strong>
          ${r.descripcion ? `<p>${esc(r.descripcion)}</p>` : ""}
          <span class="meta">${fechaHora(r.creado)} · ${r.confirmaciones || 0} confirman, ${r.negaciones || 0} dicen que ya no está</span>
          <span class="item-badges"><span class="estado-badge g-${g}">${NOMBRE_GESTION[g]}</span>${comunidad}${r.verificadoAutoridad ? '<span class="estado-badge autoridad">Verificado</span>' : ""}</span>
        </div>
      </div>
      <div class="ctl-acciones">
        ${accionG}
        <button data-acc="mapa" data-id="${esc(id)}">${ic("map-pin")}Ver en mapa</button>
        <button data-acc="verificar" data-id="${esc(id)}">${ic("badge-check")}${r.verificadoAutoridad ? "Quitar verificación" : "Verificar"}</button>
        <button data-acc="borrar" data-id="${esc(id)}" aria-label="Eliminar reporte">${ic("trash-2")}</button>
        ${votosSim ? `<button data-acc="si" data-id="${esc(id)}">+1 confirmar (demo)</button><button data-acc="no" data-id="${esc(id)}">+1 ya no está (demo)</button>` : ""}
      </div></li>`;
  }).join("") : `<li class="lista-vacia">No hay reportes ${filtroGestion === "todos" ? "" : `"${NOMBRE_GESTION[filtroGestion].toLowerCase()}"`}.</li>`;
  cargarMiniaturas(cont, 12);
}

function prepararAdmin() {
  // Acceso oculto: 5 toques en el logo (en menos de 3 s) o ?admin=1
  let toques = [];
  $("#logo").addEventListener("click", () => {
    const t = Date.now();
    toques = toques.filter((x) => t - x < 3000).concat(t);
    if (toques.length >= 5) { toques = []; abrirAdmin(); }
  });
  aplicarModoAutoridad();
  if (new URLSearchParams(location.search).get("admin") === "1") abrirAdmin();

  $("#btnSalirAutoridad").onclick = () => {
    if (!confirm("¿Salir del modo autoridad en este celular?")) return;
    lsSet("previunt_autoridad", false); aplicarModoAutoridad(); irATab("inicio");
  };
  $$(".ctl-filtros .filtro").forEach((b) => b.addEventListener("click", () => { filtroGestion = b.dataset.gestion; renderControlReportes(); }));
  $("#chkVotosSim").checked = lsGet("previunt_votosSim", false) === true;
  $("#chkVotosSim").onchange = (e) => { lsSet("previunt_votosSim", e.target.checked); renderControlReportes(); };
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
      if (b.dataset.acc === "mapa") { verReporteEnMapa(id); return; }
      if (b.dataset.acc === "atencion") { await Datos.actualizarReporte(id, { gestion: "en_atencion", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte en atención"); }
      if (b.dataset.acc === "atendido") { await Datos.actualizarReporte(id, { gestion: "atendido", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte atendido: deja de mostrarse a los vecinos"); }
      if (b.dataset.acc === "reabrir") { await Datos.actualizarReporte(id, { gestion: "pendiente", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte reabierto"); }
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
/* "Cuidado al salir": huaico confirmado por 3 vecinos (o verificado por la autoridad) a menos de 1 km */
function renderAvisoVecinal() {
  const a = alertaPorReportes();
  const caja = $("#avisoVecinal");
  if (!a) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.dataset.rep = a.id;
  const donde = a.dist !== null && a.dist !== undefined ? `a ${Math.round(a.dist / 10) * 10} m de ti` : "en la ciudad";
  const quien = a.r.verificadoAutoridad ? "Verificado por la autoridad" : `Confirmado por ${a.r.confirmaciones || 0} vecinos`;
  $("#avisoVecinalTexto").textContent = `Tránsito de huaico reportado ${donde}. ${quien} · ${hace(Math.max(a.r.ultimaConfirmacion || 0, a.r.creado || 0))}.`;
  notificarVecinal(a, donde);
}
async function notificarVecinal(a, donde) {
  const ya = lsGet("previunt_vecinalNotificados", []);
  if (ya.includes(a.id)) return;
  lsSet("previunt_vecinalNotificados", ya.concat(a.id).slice(-50));
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const titulo = "Cuidado al salir";
  const opts = { body: `Tránsito de huaico reportado por vecinos ${donde}.`, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "huaico-" + a.id, vibrate: [200] };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titulo, opts); else new Notification(titulo, opts);
  } catch (e) { try { new Notification(titulo, opts); } catch {} }
}

function renderTodo() {
  renderInicio();
  renderAvisoVecinal();
  renderCintaDemo();
  alCambiarNivel();
  renderAdmin();
}

async function iniciar() {
  // Navegación
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => {
    irATab(b.dataset.tab);
    if (b.dataset.tab === "mapa") centrarEnMi(true); // al entrar al mapa, como en Google Maps: te ubica en tu punto
  }));
  $("#btnRutaEmergencia").onclick = () => mostrarEvacuacion();
  $("#listaAcciones").onclick = (ev) => { if (ev.target.closest("[data-evac]")) mostrarEvacuacion(); };
  $("#btnCerrarAlarma").onclick = cerrarAlarma;
  $("#bannerEmergencia").onclick = abrirAlarma;
  $("#avisoVecinal").onclick = () => { const id = $("#avisoVecinal").dataset.rep; if (id) verReporteEnMapa(id); };
  $("#btnReportarInicio").onclick = abrirReporte;
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irATab(b.dataset.ir)));
  const listaClick = (ev) => { const b = ev.target.closest("[data-rep]"); if (b) verReporteEnMapa(b.dataset.rep); };
  $("#listaReportesInicio").addEventListener("click", listaClick);
  $("#listaReportesMapa").addEventListener("click", listaClick);
  const fijarHoja = (abierta) => {
    const h = $("#hojaMapa");
    h.style.transform = ""; h.style.transition = "";
    h.dataset.abierta = String(abierta); $("#asaHoja").setAttribute("aria-expanded", String(abierta));
  };
  let arrastrada = false;
  $("#asaHoja").onclick = () => {
    if (arrastrada) { arrastrada = false; return; } // el gesto ya decidió
    fijarHoja($("#hojaMapa").dataset.abierta !== "true");
  };
  // Deslizar la hoja hacia arriba o hacia abajo con el dedo (además del toque)
  (() => {
    const h = $("#hojaMapa"), asa = $("#asaHoja");
    let y0 = null, base = 0, dy = 0;
    const cerrada = () => h.getBoundingClientRect().height - 64;
    asa.addEventListener("touchstart", (e) => {
      y0 = e.touches[0].clientY; dy = 0;
      base = h.dataset.abierta === "true" ? 0 : cerrada();
      h.style.transition = "none";
    }, { passive: true });
    asa.addEventListener("touchmove", (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      const t = Math.max(0, Math.min(cerrada(), base + dy));
      h.style.transform = `translateY(${t}px)`;
      if (Math.abs(dy) > 6) e.preventDefault();
    }, { passive: false });
    asa.addEventListener("touchend", () => {
      if (y0 === null) return;
      y0 = null;
      if (Math.abs(dy) > 30) { arrastrada = true; fijarHoja(dy < 0); setTimeout(() => { arrastrada = false; }, 400); }
      else { h.style.transform = ""; h.style.transition = ""; }
    });
  })();
  $$(".filtro").forEach((b) => b.addEventListener("click", () => {
    filtroMapa = b.dataset.filtro;
    $$(".filtro").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderListas();
  }));
  $$(".chip[data-capa]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (!mapa) return;
    const grupos = b.dataset.capa === "reportes" ? [capas.reportes, capas.bloqueos] : b.dataset.capa === "cauce" ? [capas.cauce] : [capas.zonas];
    grupos.forEach((g) => on ? g.addTo(mapa) : g.remove());
  }));
  $("#btnCentrarme").onclick = () => centrarEnMi(false);
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
  $("#btnUbicacion").onclick = async (e) => { e.stopPropagation(); if (await pedirUbicacion()) cargarClima(); };
  $("#climaCuerpo").innerHTML = cwHtmlCargando();
  $("#climaCuerpo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cw]"); if (!b) return;
    if (b.dataset.cw === "alternar") cwAlternar(); else if (b.dataset.cw === "reintentar") cargarClima();
  });
  $("#btnHojaUbicacion").onclick = async () => { if (await pedirUbicacion()) { renderListas(); cargarClima(); } };

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
