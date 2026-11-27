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

const FIREBASE_SDK = "10.14.1";

/* ---------------------------------------------------------------------
   CONSTANTES
--------------------------------------------------------------------- */
const TRUJILLO = { lat: -8.11, lng: -79.03, nombre: "Trujillo centro" };

const REPORTE_CADUCA_MS = 6 * 60 * 60 * 1000; // 6 h sin nuevas confirmaciones
const VOTOS_MIN = 3;
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
const proximidadActiva = () => !!(S.demo && S.demo.proximidad);

// Acción de Inicio que abre el mapa con la ruta de evacuación desde tu ubicación
const RUTA_EVAC = { ruta: true, texto: "Conoce tu ruta" };

// Sistema de colores normado (igual en toda la app)
/* El estado NO viene de un sensor: lo publica la autoridad (Defensa Civil, COER La Libertad, municipalidad)
   desde el Panel de autoridad, citando su fuente (aviso SENAMHI, parte del COER, inspección en campo).
   Los reportes de vecinos no cambian el estado. El nivel 2 ya no se usa (un 2 antiguo se lee como En aumento).
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
    mensaje: "Nivel ya no usado: los datos antiguos con este valor se muestran como En aumento.",
    acciones: [RUTA_EVAC, "Prepárate para evacuar y ubica a tu familia", "No cruces agua ni lodo"]
  },
  {
    n: 3, estado: "DESBORDE", corto: "Desborde", color: "#C62828", titulo: "Desborde", icono: "siren",
    mensaje: "Confirmado por la autoridad. Evacúa ahora a zona alta.",
    acciones: [{ ruta: true, texto: "Evacúa ahora: conoce tu ruta" }, "Si no puedes salir, sube al piso más alto", "No cruces agua ni lodo"]
  }
];
// Estados que publica la autoridad. Son los únicos: los reportes de vecinos no cambian el estado ni avisan.
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

/* Los ids ("inundacion", "huaico", "otro"…) son los que ya están guardados en Firebase y en la cola:
   NO se cambian. Solo cambia el rótulo visible. "Lodo" reemplaza a "Huaico o lodo" para no invitar a
   acercarse al flujo. Un reporte de lodo no genera alertas: solo se ve en el mapa.
   descObligatoria: la descripción es obligatoria solo para "Otros". */
const TIPOS_REPORTE = {
  bloqueo:    { nombre: "Calle bloqueada",     icono: "construction", color: "#B71C1C" },
  inundacion: { nombre: "Punto de aniego",     icono: "waves",        color: "#00838F" },
  huaico:     { nombre: "Lodo",                icono: "mountain",     color: "#6D4C41" },
  afectados:  { nombre: "Vivienda afectada",   icono: "house-ic",     color: "#AD1457" },
  otro:       { nombre: "Otros",               icono: "circle-alert", color: "#455A64", descObligatoria: true }
};

/* Números de emergencia – verificados en gob.pe/547 (Defensa Civil 115, Bomberos 116, SAMU)
   y El Peruano (Policía 105, SAMU 106, Bomberos 116), consultados el 24/11/2026. */
/* Descripción con texto real (no vacía ni solo espacios) */
const tieneTexto = (t) => typeof t === "string" && /\S/.test(t);
/* null si el reporte es válido; si no, el mensaje que se muestra junto al campo */
function errorDescripcion(tipo, descripcion) {
  return TIPOS_REPORTE[tipo]?.descObligatoria && !tieneTexto(descripcion) ? "Describe lo que ocurrió." : null;
}

const NUMEROS_EMERGENCIA = [
  { nombre: "Defensa Civil (INDECI)", numero: "115" },
  { nombre: "Bomberos",               numero: "116" },
  { nombre: "SAMU (ambulancia)",      numero: "106" },
  { nombre: "Policía Nacional",       numero: "105" }
];

/* Centros de operaciones de emergencia por jurisdicción.
   Esta versión cubre una sola: La Libertad · provincia de Trujillo, y se muestra a todos (con o sin GPS).
   Para sumar otra región o provincia, agregar otro objeto con su cobertura y contactos.
   Los COED (distritales) aún no se muestran: no hay números distritales confirmados.
   Procedencia: COER 991 480 550 entregado por el equipo PREVIUNT (26/11/2026); el 991 480 611 se retiró
   porque está en desuso según el equipo. COEP Trujillo 925 512 879 entregado por el equipo (27/11/2026).
   TODO: verificar con fuente oficial: pedir a COER La Libertad y a la MPT que confirmen la vigencia de
   ambos números antes de publicar. */
const DIRECTORIO_EMERGENCIA = [
  {
    id: "la-libertad-trujillo", cobertura: "La Libertad · Trujillo", region: "La Libertad", provincia: "Trujillo",
    centros: [
      { nombre: "COER La Libertad", detalle: "Centro de Operaciones de Emergencia Regional", tel: "+51991480550", mostrar: "991 480 550", procedencia: "Equipo PREVIUNT, 26/11/2026" },
      { nombre: "COEP Trujillo", detalle: "Centro de Operaciones de Emergencia Provincial", tel: "+51925512879", mostrar: "925 512 879", procedencia: "Equipo PREVIUNT, 27/11/2026" }
    ],
    // Central telefónica general de la municipalidad (no es un centro de emergencias).
    // Fuente: Plan de Contingencia ante Lluvias Intensas, Región La Libertad 2025-2026 (Anexo 5).
    otros: [
      { nombre: "Central municipal (MPT)", detalle: "Central telefónica general de la Municipalidad Provincial de Trujillo", tel: "+5144484240", mostrar: "(044) 484240" }
    ]
  }
];

/* NOTICIAS: obras y acciones públicas frente a las lluvias y El Niño. Son informativas: los avisos
   activos de la quebrada están en Inicio y nunca se mezclan aquí.
   El contenido está en noticias/noticias.json y sus imágenes en noticias/ (servidas desde el repositorio).
   Campos: id, titulo, fecha ("AAAA-MM-DD" o null si aún no está confirmada), tipo ("Archivo" = nota histórica),
   entidad, zona, resumen, fuente (enlace original), imagen (archivo en noticias/), imagenAlt, creditoImagen.
   Opcional: estado ("anunciada" | "en_ejecucion" | "concluida") solo si la publicación lo respalda.
   Orden: primero las sin fecha confirmada (pendientes de confirmar, en el orden del archivo), luego las
   fechadas de la más reciente a la más antigua. */
const RUTA_NOTICIAS = "noticias/";
const ESTADO_NOTICIA = {
  anunciada:    { texto: "Anunciada",    icono: "clock" },
  en_ejecucion: { texto: "En ejecución", icono: "construction" },
  concluida:    { texto: "Concluida",    icono: "circle-check" }
};

/* CONÓCENOS. Motivación compartida por el equipo (27/11/2026).
   EQUIPO: completar con la lista definitiva. Solo nombres, roles, aportes, fotos y créditos que entregue
   el equipo. foto: ruta relativa (p. ej. "icons/equipo/nombre.jpg") o null.
   Mientras esté vacío, "El equipo" no se muestra. TODO: lista definitiva del equipo. */
const EQUIPO = [ // texto entregado por el equipo (27/11/2026)
  { nombre: "Claudio Guzman Campos", foto: null },
  { nombre: "Cristhian Vigo Villar", foto: null },
  { nombre: "Joaquin Portilla Gutierrez", foto: null }
];
const INTRO_EQUIPO = "Somos estudiantes de Ingeniería Mecatrónica de la Universidad Nacional de Trujillo, y también somos ciudadanos.";
const MOTIVACION = [ // ideas del equipo, ordenadas (27/11/2026)
  "Creemos que la participación de la comunidad es la manera más rápida de reportar un problema que ocurre a nuestro alrededor.",
  "Cuando esos reportes se unen a la disposición de las autoridades, la comunidad puede ser escuchada.",
  "Por eso buscamos una relación horizontal entre vecinos y autoridades: así todos estamos juntos frente a los desastres."
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
    "Desde un lugar seguro, confirma en el mapa los reportes de tu zona para avisar a tus vecinos",
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

/* ---------------------------------------------------------------------
   SIN CONEXIÓN: estado de la red, datos guardados y cola de reportes
   - Red: lo que sabemos de la conexión (Firebase .info/connected + navigator.onLine).
   - Caché: último estado oficial, demo, historial y clima recibidos del servidor (localStorage).
     Se muestran SOLO como "dato guardado", nunca como alerta actual.
   - Cola: reportes hechos sin conexión, guardados en IndexedDB hasta que el servidor confirme.
--------------------------------------------------------------------- */
const Red = { conectado: false, enLinea: navigator.onLine !== false, desde: Date.now() };
/* Sirena física (ESP32): zona de la quebrada, zona de banco de pruebas y vigencia de cada alerta.
   La vigencia máxima (1 h) la exigen las reglas y el ESP32; la app de la autoridad la renueva sola mientras siga el desborde. */
const ZONA_QUEBRADA = "san-ildefonso-01";
const ZONA_PRUEBA = "prueba-01";
const VIGENCIA_ALERTA_S = 3600;
const alertaDispositivo = (zone, level, eventId, updatedAt, validUntil) => ({ level, origin: "authority", zone, eventId, updatedAt, validUntil });
const VENTANA_REPORTES_MS = 72 * 3600 * 1000;  // el mapa solo pide reportes de los últimos 3 días
const MAX_REPORTES = 300;                       // y como máximo los 300 más recientes
const MAX_HISTORIAL = 30;
const LIMITE_FOTO_CHARS = 380000;               // las reglas de /fotos aceptan < 400 000 caracteres (~280 KB)
const VENCE_COLA_MS = 2 * 3600 * 1000 - 120000;  // las reglas aceptan reportes de hasta 2 h atrás (se deja 2 min de margen)

const Cache = {
  guardar(canal, v) { lsSet("previunt_cache_" + canal, { v, t: Date.now() }); },
  leer(canal) { return lsGet("previunt_cache_" + canal, null); }
};

/* Promesa con tiempo límite: un envío sin respuesta no queda colgado para siempre */
const conTiempo = (p, ms, msg = "Sin respuesta del servidor") =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

/* Espera creciente con variación aleatoria (evita que muchos celulares reintenten a la vez) */
function esperaReintento(intentos) {
  const base = Math.min(10 * 60 * 1000, 5000 * 2 ** Math.max(0, intentos - 1));
  return Math.round(base * (0.5 + Math.random()));
}

/* IndexedDB mínimo: una sola tienda "pendientes" con clave = id del reporte */
const BD = {
  _db: null,
  abrir() {
    if (this._db) return this._db;
    this._db = new Promise((ok, mal) => {
      if (!("indexedDB" in window)) { mal(new Error("Este navegador no tiene IndexedDB")); return; }
      const r = indexedDB.open("previunt", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("pendientes", { keyPath: "id" }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
    return this._db;
  },
  async _tx(modo, fn) {
    const db = await this.abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction("pendientes", modo);
      const st = t.objectStore("pendientes");
      let res; const req = fn(st);
      if (req) req.onsuccess = () => { res = req.result; };
      t.oncomplete = () => ok(res);
      t.onerror = () => mal(t.error); t.onabort = () => mal(t.error || new Error("Transacción cancelada"));
    });
  },
  todos() { return this._tx("readonly", (st) => st.getAll()); },
  poner(item) { return this._tx("readwrite", (st) => st.put(item)); },
  quitar(id) { return this._tx("readwrite", (st) => st.delete(id)); }
};

/* Id único generado en el celular: el mismo reporte usa siempre la misma clave en el servidor,
   así un reintento nunca crea un duplicado. */
const idReporteLocal = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const NOMBRE_COLA = {
  pendiente: "Pendiente de envío",
  enviando: "Enviando…",
  subiendo_foto: "Subiendo foto…",
  enviado: "Enviado",
  error: "Error; se reintentará",
  otra_sesion: "Guardado con otra sesión",
  falta_detalle: "Falta describir lo que ocurrió",
  vencido: "No se envió a tiempo"
};

const Cola = {
  items: [],            // copia en memoria de lo que hay en IndexedDB (para pintar)
  enviados: [],         // enviados en esta sesión (se muestran un momento como "Enviado")
  _corriendo: false,
  _timer: null,

  async cargar() {
    try { this.items = (await BD.todos()).sort((a, b) => a.creadoLocal - b.creadoLocal); }
    catch (e) { console.warn("Cola:", e); this.items = []; }
    renderPendientes(); renderBadgeConexion();
    this.ejecutar(); // al abrir la app se reintenta lo pendiente
  },
  async agregar(datos, foto) {
    const err = errorDescripcion(datos.tipo, datos.descripcion);
    if (err) throw new Error(err);
    const item = {
      id: idReporteLocal(), datos, foto: foto || null,
      uid: Datos.uid || null,           // sesión con la que se creó (null si aún no había sesión)
      creadoLocal: ahora(), estado: "pendiente", intentos: 0, proximo: 0, error: "",
      datosOk: false, fotoOk: !foto
    };
    await BD.poner(item);                // se guarda ANTES de intentar enviar: no se pierde al cerrar la app
    this.items.push(item);
    renderPendientes(); renderBadgeConexion();
    this.ejecutar();
    return item;
  },
  async _guardar(item) { await BD.poner(item); renderPendientes(); renderBadgeConexion(); },
  async descartar(id) {
    await BD.quitar(id);
    this.items = this.items.filter((x) => x.id !== id);
    renderPendientes(); renderBadgeConexion();
  },
  async describir(id, descripcion) {
    const it = this.items.find((x) => x.id === id); if (!it) return;
    it.datos.descripcion = descripcion; it.estado = "pendiente"; it.error = ""; it.proximo = 0;
    await this._guardar(it); this.ejecutar();
  },
  async usarSesionActual(id) {
    const it = this.items.find((x) => x.id === id); if (!it || !Datos.uid) return;
    it.uid = Datos.uid; it.estado = "pendiente"; it.error = ""; it.proximo = 0;
    await this._guardar(it); this.ejecutar();
  },
  programar() {
    clearTimeout(this._timer);
    const futuros = this.items.filter((x) => x.estado === "error").map((x) => x.proximo);
    if (!futuros.length) return;
    const espera = Math.max(1000, Math.min(...futuros) - Date.now());
    this._timer = setTimeout(() => this.ejecutar(), espera);
  },

  /* Envía lo que se pueda. Solo marca "enviado" cuando el servidor confirma (la promesa de Firebase
     se resuelve al recibir el acuse del servidor). Si algo falla, el reporte se queda guardado. */
  async ejecutar() {
    if (this._corriendo) return;
    if (Datos.modo !== "firebase" || !Red.conectado || !Datos.uid) { renderPendientes(); renderBadgeConexion(); return; }
    this._corriendo = true; renderBadgeConexion();
    try {
      for (const it of [...this.items]) {
        if (it.estado === "otra_sesion" || it.estado === "vencido") continue;
        if (!it.datosOk && ahora() - it.creadoLocal > VENCE_COLA_MS) { it.estado = "vencido"; await this._guardar(it); continue; }
        if (it.estado === "error" && it.proximo > Date.now()) continue;
        if (it.estado === "falta_detalle" || (!it.datosOk && errorDescripcion(it.datos.tipo, it.datos.descripcion))) {
          if (it.estado !== "falta_detalle") { it.estado = "falta_detalle"; await this._guardar(it); }
          continue;
        }
        if (!Red.conectado) break;
        if (it.uid && it.uid !== Datos.uid) { it.estado = "otra_sesion"; await this._guardar(it); continue; }
        if (!it.uid) it.uid = Datos.uid; // creado antes de tener sesión en este celular: se envía con la de ahora
        try {
          if (!it.datosOk) {
            it.estado = "enviando"; await this._guardar(it);
            await conTiempo(Datos.crearReporte(it), 20000);
            it.datosOk = true; await this._guardar(it);
          }
          if (!it.fotoOk) {
            it.estado = "subiendo_foto"; await this._guardar(it);
            await conTiempo(Datos.subirFoto(it.id, it.foto), 60000, "La foto no terminó de subir");
            it.fotoOk = true; await this._guardar(it);
          }
          await BD.quitar(it.id); // recién aquí se borra la copia local (datos y foto confirmados)
          this.items = this.items.filter((x) => x.id !== it.id);
          this.enviados.push({ ...it, foto: null, estado: "enviado", enviadoEn: Date.now() });
          toast("Tu reporte se envió.");
        } catch (e) {
          console.warn("Envío pendiente:", it.id, e);
          it.intentos += 1;
          it.estado = "error";
          it.error = e?.code === "PERMISSION_DENIED" || /permission/i.test(e?.message || "")
            ? "El servidor rechazó el reporte (permiso)." : (e?.message || "Error de red");
          it.proximo = Date.now() + esperaReintento(it.intentos);
          await this._guardar(it);
        }
      }
    } finally {
      this._corriendo = false;
      this.programar(); renderPendientes(); renderBadgeConexion();
    }
  }
};

/* Acciones que deben confirmarse en el momento (estado oficial, votos, gestión): sin servidor no se hacen */
function sinServidor(queNoPaso) {
  if (Datos.modo === "local" || (Datos.modo === "firebase" && Red.conectado)) return false;
  toast(`Sin conexión: ${queNoPaso}. Inténtalo cuando vuelva la señal.`, 4500);
  return true;
}

/* Indicador de conexión en la cabecera: en línea, sin conexión o sincronizando */
function renderBadgeConexion() {
  const b = $("#badgeConexion"); if (!b) return;
  const n = Cola.items.length;
  let txt, cls, tit;
  if (Datos.modo === "local") { txt = "Modo local"; cls = "local"; tit = "Sin Firebase: los datos se guardan solo en este navegador"; }
  else if (Datos.modo === "firebase" && Red.conectado) {
    const enCurso = Cola.items.filter((x) => x.estado === "pendiente" || x.estado === "enviando" || x.estado === "subiendo_foto").length;
    txt = Cola._corriendo || enCurso ? `Sincronizando${enCurso ? ` (${enCurso})` : ""}` : n ? `En línea · ${n} sin enviar` : "En línea";
    cls = Cola._corriendo || enCurso ? "sync" : "";
    tit = "Conectado al servidor";
  } else {
    txt = n ? `Sin conexión · ${n} por enviar` : "Sin conexión"; cls = "off";
    tit = `Sin conexión desde las ${hora(Red.desde)}. Lo que ves puede estar desactualizado.`;
  }
  b.textContent = "● " + txt; b.title = tit;
  b.className = "badge-conexion " + cls;
}
function cambiarConexion(conectado) {
  if (conectado === Red.conectado) return;
  Red.conectado = conectado; Red.desde = Date.now();
  renderBadgeConexion(); renderTodo();
  if (conectado) Cola.ejecutar();
}

/* Lista "Tus reportes por enviar" en Inicio */
function renderPendientes() {
  const sec = $("#seccionPendientes"); if (!sec) return;
  const recientes = Cola.enviados.filter((x) => Date.now() - x.enviadoEn < 60000);
  const todos = Cola.items.concat(recientes);
  sec.hidden = todos.length === 0;
  if (!todos.length) return;
  $("#listaPendientes").innerHTML = todos.map((it) => {
    const T = TIPOS_REPORTE[it.datos.tipo] || TIPOS_REPORTE.otro;
    let estado = NOMBRE_COLA[it.estado] || it.estado, extra = "";
    if (it.estado === "pendiente" && Datos.modo === "firebase" && Red.conectado && !Datos.uid) estado = "Esperando sesión";
    if (it.estado === "pendiente" && !Red.conectado) extra = "Se enviará cuando vuelva la conexión.";
    if (it.estado === "error") extra = `${esc(it.error)} Próximo intento: ${hora(it.proximo)}.`;
    if (it.estado === "otra_sesion") extra = "Se guardó con otra cuenta de este celular. Puedes enviarlo con tu cuenta actual o descartarlo.";
    if (it.estado === "falta_detalle") extra = "Para «Otros» hay que describir qué pasó antes de enviarlo.";
    if (it.estado === "vencido") extra = "Pasaron más de 2 horas sin señal: ya no se puede enviar como reporte actual. Si el problema sigue, haz un reporte nuevo.";
    if (it.datosOk && !it.fotoOk && it.estado !== "subiendo_foto") extra = "Los datos ya se enviaron; falta la foto. " + extra;
    const botones = it.estado === "otra_sesion"
      ? `<button class="btn-texto btn-texto-chico" data-cola="sesion" data-id="${esc(it.id)}">Enviar con mi cuenta actual</button><button class="btn-texto btn-texto-chico" data-cola="descartar" data-id="${esc(it.id)}">Descartar</button>`
      : it.estado === "vencido" ? `<button class="btn-texto btn-texto-chico" data-cola="descartar" data-id="${esc(it.id)}">Descartar</button>`
      : it.estado === "falta_detalle" ? `<span class="pend-describir"><label class="solo-lector" for="desc-${esc(it.id)}">Describe lo que ocurrió</label><textarea id="desc-${esc(it.id)}" maxlength="200" rows="2" placeholder="Describe lo que ocurrió">${esc(it.datos.descripcion || "")}</textarea><button class="btn-texto btn-texto-chico" data-cola="describir" data-id="${esc(it.id)}">Guardar y enviar</button><button class="btn-texto btn-texto-chico" data-cola="descartar" data-id="${esc(it.id)}">Descartar</button></span>`
      : it.estado === "error" ? `<button class="btn-texto btn-texto-chico" data-cola="reintentar" data-id="${esc(it.id)}">Reintentar ahora</button><button class="btn-texto btn-texto-chico" data-cola="descartar" data-id="${esc(it.id)}">Descartar</button>` : "";
    return `<li class="pend-item pend-${it.estado}">
      <span class="item-foto">${it.foto ? `<img src="${esc(it.foto)}" alt="">` : ic(T.icono)}</span>
      <span class="pend-cuerpo"><span class="item-titulo">${esc(T.nombre)}</span>
        <span class="item-meta">Creado ${hora(it.creadoLocal)}${it.foto ? " · con foto" : ""}</span>
        <span class="pend-estado">${["enviando", "subiendo_foto"].includes(it.estado) || (it.estado === "pendiente" && Red.conectado) ? '<span class="spinner spinner-chico" aria-hidden="true"></span>' : ""}${esc(estado)}</span>${extra ? `<span class="pend-extra">${extra}</span>` : ""}
        ${botones ? `<span class="pend-botones">${botones}</span>` : ""}</span></li>`;
  }).join("");
}

/* Valores guardados al abrir la app (solo como referencia, nunca como alerta actual) */
function cargarDatosGuardados() {
  if (!firebaseConfigurado()) return;
  const cs = Cache.leer("sensor"), cd = Cache.leer("demo"), ch = Cache.leer("historial");
  S.guardado = { sensor: cs, demo: cd };
  if (cs) S.sensor = cs.v;
  if (cd) S.demo = cd.v || { activo: false, nivel: 0 };
  if (ch) S.historial = ch.v || {};
}

const Datos = {
  modo: "local",
  uid: null,
  _subs: {},

  async init() {
    if (!firebaseConfigurado()) { this._initLocal(); return; }
    try {
      await this._initFirebase();
      this.modo = "firebase";
    } catch (e) {
      // Sin la librería de Firebase (p. ej. primera vez sin conexión): no se cae a "modo local",
      // los reportes van a la cola y se reintenta al volver la conexión.
      console.error("Firebase no disponible:", e);
      this.modo = "sinConexion";
      this._reintentarInit();
    }
  },
  _intentosInit: 0,
  _exigirServidor() { if (this.modo !== "firebase") throw new Error("Sin conexión con el servidor"); },
  _reintentarInit() {
    const intentar = async () => {
      if (this.modo === "firebase") return;
      try {
        await this._initFirebase();
        this.modo = "firebase";
        Object.entries(this._subs).forEach(([canal, cbs]) => cbs.forEach((cb) => this._subFirebase(canal, cb)));
        renderBadgeConexion();
      } catch (e) {
        // El navegador puede recordar que la librería no cargó. Si ya responde, se recarga la página
        // (la cola está en IndexedDB, no se pierde nada); si hay un reporte a medio llenar, se espera.
        try {
          const r = await fetch(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-app.js`, { cache: "no-store" });
          const ultima = Number(sessionStorage.getItem("previunt_recarga") || 0);
          if (r.ok && $("#hojaReporte").hidden && Date.now() - ultima > 120000) {
            sessionStorage.setItem("previunt_recarga", String(Date.now())); location.reload(); return;
          }
        } catch {}
        this._intentosInit++;
        setTimeout(intentar, esperaReintento(this._intentosInit));
      }
    };
    window.addEventListener("online", intentar);
    setTimeout(intentar, esperaReintento(1));
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
    return {}; // votos, perfiles y bloqueados: en modo local no hay cuentas (los votos van dentro del reporte)
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
    /* Pruebas en la PC con los emuladores de Firebase (pruebas/LEEME.md): http://localhost:8000/?emu=1
       Solo funciona en localhost; en GitHub Pages se ignora y siempre se usa el proyecto real. */
    const emu = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("emu") === "1";
    const config = emu ? { ...FIREBASE_CONFIG, projectId: "demo-previunt3", databaseURL: "http://127.0.0.1:9000?ns=demo-previunt3" } : FIREBASE_CONFIG;
    const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(config);
    this.db = dbM.getDatabase(app);
    if (emu && !this._emu) { dbM.connectDatabaseEmulator(this.db, "127.0.0.1", 9000); this._emu = true; console.warn("PREVIUNT: usando los EMULADORES de Firebase"); }
    this.fb = dbM;
    // Sesión anónima: Firebase la guarda en el celular y la recupera sin red.
    // Sin sesión no se escribe nada (las reglas exigen auth): la cola espera.
    const auth = authM.getAuth(app);
    if (emu && !auth.emulatorConfig) authM.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    auth.languageCode = "es"; // SMS, reCAPTCHA y correos en español
    this.auth = auth;
    this.authM = authM;
    // Espera la sesión guardada en el celular (anónima o de una cuenta) para no reemplazarla
    try { await conTiempo(auth.authStateReady(), 8000); } catch {}
    this.uid = auth.currentUser?.uid || null;
    authM.onAuthStateChanged(auth, (u) => {
      const antes = this.uid;
      this.uid = u?.uid || null;
      if (this.uid !== antes) { renderPendientes(); Cola.ejecutar(); }
    });
    let anonEnCurso = null; // una sola sesión anónima a la vez (al abrir la app y al cerrar sesión)
    const iniciarSesion = async (intento = 1) => {
      if (auth.currentUser) return;
      if (navigator.onLine === false) { window.addEventListener("online", () => iniciarSesion(1), { once: true }); return; }
      if (anonEnCurso) return anonEnCurso;
      try { anonEnCurso = conTiempo(authM.signInAnonymously(auth), 15000); await anonEnCurso; }
      catch (e) {
        console.warn("Sesión anónima:", e);
        if (e?.code === "auth/admin-restricted-operation" || e?.code === "auth/operation-not-allowed") {
          toast("Aviso: activa 'Anónimo' en Firebase Authentication."); return;
        }
        setTimeout(() => iniciarSesion(intento + 1), esperaReintento(intento));
      } finally { anonEnCurso = null; }
    };
    this._sesionAnonima = () => iniciarSesion(1);
    iniciarSesion();
    dbM.onValue(dbM.ref(this.db, ".info/serverTimeOffset"), (s) => { serverOffset = s.val() || 0; });
    dbM.onValue(dbM.ref(this.db, ".info/connected"), (s) => cambiarConexion(s.val() === true));
    this._rutas = { sensor: "quebrada_san_ildefonso", demo: "demo", reportes: "reportes", historial: "historial_nivel",
                    votos: "votos", perfiles: "perfiles", bloqueados: "bloqueados", verificados: "verificados" };
    Cuenta.iniciar(); // cuentas: sesión, tipo de cuenta y rol (evento "sesion")
  },

  /* ---------- API común ---------- */
  suscribir(canal, cb) {
    if (this.modo === "local") return this._subLocal(canal, cb);
    (this._subs[canal] = this._subs[canal] || []).push(cb);
    if (this.modo === "firebase") this._subFirebase(canal, cb);
  },
  _subFirebase(canal, cb) {
    const { onValue, ref, query, orderByChild, limitToLast, startAt } = this.fb;
    let r = ref(this.db, this._rutas[canal]);
    // Historial: solo los últimos cambios. Reportes: solo los recientes (ventana de 3 días, máx. 300).
    // Requiere ".indexOn" en las reglas para que el filtro se haga en el servidor.
    if (canal === "historial") r = query(r, orderByChild("fecha"), limitToLast(MAX_HISTORIAL));
    if (canal === "reportes") r = query(r, orderByChild("creado"), startAt(ahora() - VENTANA_REPORTES_MS), limitToLast(MAX_REPORTES));
    onValue(r, (s) => {
      const v = s.val();
      if (canal === "sensor" || canal === "demo" || canal === "historial") Cache.guardar(canal, v);
      if (canal === "sensor" || canal === "demo") S.vivo[canal] = true;
      cb(v);
    }, (err) => {
      console.error(canal, err);
      if (["votos", "perfiles", "bloqueados", "verificados"].includes(canal)) cb({});
    });
  },

  /* Estado oficial (solo autoridad). En la MISMA escritura se actualiza /alertas/{zona}, que es lo que leen
     los ESP32 con su propia cuenta (no es público). Las reglas exigen que ambos coincidan.
     eventId: se conserva al renovar la vigencia del mismo evento; cada publicación nueva crea uno nuevo. */
  async publicarEstado(nivel, fuente, renovar = null) {
    const t = ahora(), s = Math.floor(t / 1000);
    const eventId = renovar ? renovar.eventId : `evt-${s}-${Math.random().toString(36).slice(2, 8)}`;
    const valor = {
      nivel, estado: NIVELES[nivel].estado, actualizado: renovar ? renovar.actualizado : t, origen: "autoridad", fuente, autor: this.uid,
      zona: ZONA_QUEBRADA, eventId, updatedAt: s, validUntil: s + VIGENCIA_ALERTA_S
    };
    if (this.modo === "local") { lsSet("previunt_sensor", valor); this._emitLocal("sensor"); return; }
    this._exigirServidor();
    await this.fb.update(this.fb.ref(this.db), {
      quebrada_san_ildefonso: valor,
      [`alertas/${ZONA_QUEBRADA}`]: alertaDispositivo(ZONA_QUEBRADA, nivel, eventId, s, s + VIGENCIA_ALERTA_S)
    });
  },
  /* Alerta de PRUEBA para el banco de trabajo: zona aparte, no toca el estado oficial ni la app de nadie */
  async alertaPrueba(encender) {
    this._exigirServidor();
    const s = Math.floor(ahora() / 1000);
    await this.fb.set(this.fb.ref(this.db, `alertas/${ZONA_PRUEBA}`),
      alertaDispositivo(ZONA_PRUEBA, encender ? 3 : 0, `prueba-${s}`, s, s + (encender ? 120 : 600)));
  },

  async setDemo(activo, nivel, fuente = "") {
    const valor = { activo, nivel: nivelValido(nivel) ? nivel : 0, actualizado: ahora(), fuente };
    if (this.modo === "local") { lsSet("previunt_demo", { ...lsGet("previunt_demo", {}), ...valor }); this._emitLocal("demo"); return; }
    this._exigirServidor();
    await this.fb.update(this.fb.ref(this.db, "demo"), valor);
  },

  async setProximidad(on) {
    if (this.modo === "local") { lsSet("previunt_demo", { ...lsGet("previunt_demo", { activo: false, nivel: 0 }), proximidad: !!on }); this._emitLocal("demo"); return; }
    this._exigirServidor();
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
    this._exigirServidor();
    // id determinístico: si varios celulares detectan el mismo cambio, se escribe una sola vez
    await this.fb.set(this.fb.ref(this.db, `historial_nivel/${id}`), entrada);
  },

  async addReporte(r) {
    const errD = errorDescripcion(r.tipo, r.descripcion);
    if (errD) throw new Error(errD);
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

  /* Crea el reporte con el id local SOLO si no existe (transacción): un reintento no lo duplica
     ni pisa los votos que ya tenga. Se resuelve cuando el servidor confirma. */
  async crearReporte(it) {
    const rep = {
      ambito: "ciudad", ...it.datos, autor: it.uid, creado: it.creadoLocal, verificadoAutoridad: false,
      tieneFoto: false, ...(it.foto ? { fotoPendiente: true } : {})
    };
    const ref = this.fb.ref(this.db, `reportes/${it.id}`);
    const tx = await this.fb.runTransaction(ref, (actual) => (actual === null ? rep : undefined), { applyLocally: false });
    if (tx.committed) return "creado";
    const v = tx.snapshot.val();
    if (v && v.autor === it.uid) return "ya_existia";          // el intento anterior sí llegó
    throw new Error("Ya existe un reporte con ese identificador");
  },
  /* La foto va después, en /fotos/{id}. Recién cuando el servidor confirma, el reporte la anuncia. */
  async subirFoto(id, foto) {
    await this.fb.set(this.fb.ref(this.db, `fotos/${id}`), foto);
    await this.fb.update(this.fb.ref(this.db, `reportes/${id}`), { tieneFoto: true, fotoPendiente: null });
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
    this._exigirServidor();
    // Un voto por persona en /votos/{id}/{uid}: las reglas impiden votar dos veces, el propio reporte o a nombre de otro
    const r = S.reportes && S.reportes[id];
    if (!r || r.autor === uidVoto) return false;
    if (S.votos && S.votos[id] && S.votos[id][uidVoto]) return false;
    try {
      await this.fb.set(this.fb.ref(this.db, `votos/${id}/${uidVoto}`), { v: voto, t: this.fb.serverTimestamp() });
      return true;
    } catch (e) { console.warn("Voto rechazado:", e); return false; }
  },

  /* Bloquear (o desbloquear) al autor de reportes falsos: solo admins (reglas) */
  async bloquear(uid, on) {
    if (this.modo === "local") return;
    this._exigirServidor();
    await this.fb.set(this.fb.ref(this.db, `bloqueados/${uid}`), on ? true : null);
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
    this._exigirServidor();
    await this.fb.update(this.fb.ref(this.db, `reportes/${id}`), cambios);
  },

  async borrarReporte(id) {
    if (this.modo === "local") {
      const todos = lsGet("previunt_reportes", {}); delete todos[id];
      lsSet("previunt_reportes", todos); this._emitLocal("reportes"); return;
    }
    this._exigirServidor();
    await this.fb.update(this.fb.ref(this.db), { [`reportes/${id}`]: null, [`fotos/${id}`]: null, [`votos/${id}`]: null });
  }
};

/* === CUENTAS (inicio) ================================================
   PREVIUNT · CUENTAS: registro con DNI y celular, SMS, login por usuario,
   cuentas UNT con verificación por correo, recuperación de contraseña.
   Usa Datos.auth / Datos.authM (Firebase Auth) y Datos.db / Datos.fb (Realtime Database).
   Las pruebas de pruebas/ leen este bloque directamente de app.js (entre las marcas "CUENTAS").
   ===================================================================== */

/* Dominio de los correos internos de las cuentas personales (usuario@dominio).
   .invalid es un dominio reservado: ningún correo llega ahí, así nadie puede pedir
   un "restablecer contraseña" y recibirlo. NO cambiarlo después de crear cuentas. */
const DOMINIO_CUENTAS = "previunt.invalid";
/* Consentimiento de datos personales: apagado mientras la app sea una demo interna.
   Antes de abrirla a gente real: poner true (aparece la casilla obligatoria y se guarda la fecha). */
const PEDIR_CONSENTIMIENTO = false;
const CORREO_DATOS = "t1533600121@unitru.edu.pe"; // a dónde se pide borrar la cuenta y los datos
const RE_USUARIO = /^[a-z0-9_]{3,20}$/;
const RE_UNT = /@unitru\.edu\.pe$/i;
const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,60}$/;
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const normalizarUsuario = (u) => String(u || "").trim().toLowerCase();
/* Las cuentas UNT llevan siempre "_unt" al final (y solo ellas): así una persona puede tener
   "clau_udio" (personal) y "clau_udio_unt" (UNT). En el formulario se escribe solo la parte base. */
const SUFIJO_UNT = "_unt";
const usuarioFinal = (u, tipo) => {
  const b = normalizarUsuario(u);
  return tipo === "unt" ? b.replace(/_unt$/, "") + SUFIJO_UNT : b;
};
/* Mensaje de error del nombre de usuario (null si está bien) */
function errorUsuario(u, tipo) {
  const b = normalizarUsuario(u);
  if (tipo === "unt") {
    const base = b.replace(/_unt$/, "");
    return /^[a-z0-9_]{3,16}$/.test(base) ? null : "De 3 a 16 caracteres: letras minúsculas, números o _ (al final se agrega _unt).";
  }
  if (!RE_USUARIO.test(b)) return "De 3 a 20 caracteres: letras minúsculas, números o _.";
  if (b.endsWith(SUFIJO_UNT)) return "Los nombres que terminan en _unt son solo para cuentas UNT.";
  return null;
}
/* Lo que la persona escribe en "Usuario o correo UNT" → correo con el que entra en Firebase */
const correoLogin = (txt) => {
  const s = String(txt || "").trim().toLowerCase();
  return s.includes("@") ? s : `${s}@${DOMINIO_CUENTAS}`;
};
const celularE164 = (nueve) => "+51" + String(nueve || "").replace(/\D/g, "");

/* Valida el formulario de registro. tipo = "personal" | "unt".
   d = { nombres, apellidos, usuario, celular, correo, dni, clave, clave2, acepto }
   (celular = 9 dígitos sin +51). completar = true cuando se retoma un registro (sin usuario ni contraseña).
   Devuelve { campo: "mensaje" }; vacío si todo está bien. */
function validarRegistro(d, tipo, completar = false) {
  const e = {};
  if (!RE_NOMBRE.test(String(d.nombres || "").trim())) e.nombres = "Escribe tus nombres (solo letras).";
  if (!RE_NOMBRE.test(String(d.apellidos || "").trim())) e.apellidos = "Escribe tus apellidos (solo letras).";
  if (!completar && errorUsuario(d.usuario, tipo)) e.usuario = errorUsuario(d.usuario, tipo);
  if (!/^9\d{8}$/.test(String(d.celular || ""))) e.celular = "9 dígitos y empieza con 9.";
  if (!/^\d{8}$/.test(String(d.dni || ""))) e.dni = "El DNI tiene 8 dígitos.";
  const correo = String(d.correo || "").trim();
  if (tipo === "unt") { if (!RE_UNT.test(correo)) e.correo = "Usa tu correo @unitru.edu.pe."; }
  else if (!RE_CORREO.test(correo)) e.correo = "Escribe un correo válido.";
  else if (RE_UNT.test(correo)) e.correo = "Para la cuenta personal usa un correo que no sea @unitru.edu.pe.";
  if (!completar) {
    if (String(d.clave || "").length < 8) e.clave = "Mínimo 8 caracteres.";
    if (d.clave !== d.clave2) e.clave2 = "Las contraseñas no coinciden.";
  }
  if (PEDIR_CONSENTIMIENTO && !d.acepto) e.acepto = "Debes aceptar el tratamiento de tus datos para registrarte.";
  return e;
}

/* Traduce errores de Firebase a mensajes para la persona */
function mensajeError(err) {
  const m = {
    "auth/invalid-credential": "Usuario o contraseña incorrectos.",
    "auth/invalid-login-credentials": "Usuario o contraseña incorrectos.",
    "auth/wrong-password": "Usuario o contraseña incorrectos.",
    "auth/user-not-found": "Usuario o contraseña incorrectos.",
    "auth/invalid-email": "Usuario o contraseña incorrectos.",
    "auth/missing-password": "Escribe tu contraseña.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/invalid-verification-code": "El código no es correcto.",
    "auth/missing-verification-code": "Escribe el código de 6 dígitos.",
    "auth/code-expired": "El código venció. Pide uno nuevo.",
    "auth/credential-already-in-use": "Ese celular ya está registrado en otra cuenta.",
    "auth/account-exists-with-different-credential": "Ese celular ya está registrado en otra cuenta.",
    "auth/provider-already-linked": "Esta cuenta ya tiene un celular verificado.",
    "auth/invalid-phone-number": "Número de celular no válido.",
    "auth/quota-exceeded": "Se alcanzó el límite de SMS de hoy. Intenta más tarde.",
    "auth/captcha-check-failed": "No se pudo comprobar que no eres un robot. Recarga la página.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
    "auth/requires-recent-login": "Por seguridad, vuelve a pedir el código.",
    "auth/operation-not-allowed": "Este tipo de cuenta aún no está activado en Firebase.",
    "auth/billing-not-enabled": "Por ahora no se pueden enviar SMS a números reales. Usa un número de prueba.",
    "auth/weak-password": "La contraseña es muy débil (mínimo 8 caracteres)."
  };
  if (err && err.code === "auth/operation-not-allowed" && /region/i.test(err.message || "")) return "Todavía no se pueden enviar códigos SMS a números de Perú.";
  return m[err && err.code] || (err && err.message) || "Ocurrió un error.";
}

const Cuenta = {
  usuario: null,       // { uid, tipo, esAdmin, celularVerificado, correoVerificado, correo, nombreUsuario, registrado }
  _verificador: null,  // RecaptchaVerifier
  _confirmacion: null, // ConfirmationResult del SMS
  _pendiente: null,
  _iniciado: false,

  /* Llamar una vez, después de Datos.init(), solo en modo Firebase */
  iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;
    Datos.authM.onIdTokenChanged(Datos.auth, (u) => this._actualizar(u).catch((e) => console.warn("Cuenta:", e)));
  },

  /* Sin señal (o mientras carga Firebase) se usa la última sesión conocida de este celular. Solo es
     para la interfaz: las reglas de la base de datos deciden de verdad al enviar. */
  cargarGuardada() {
    if (typeof localStorage === "undefined") return;
    try { const c = JSON.parse(localStorage.getItem("previunt_cuenta") || "null"); if (c && c.uid) this.usuario = c; } catch {}
  },
  _guardar() {
    if (typeof localStorage === "undefined") return;
    try {
      if (this.usuario && this.usuario.tipo !== "invitado") localStorage.setItem("previunt_cuenta", JSON.stringify(this.usuario));
      else localStorage.removeItem("previunt_cuenta");
    } catch {}
  },

  _seq: 0,
  async _actualizar(u) {
    const A = Datos.authM, F = Datos.fb;
    const n = ++this._seq; // si llegan dos cambios seguidos, gana el último (no uno más lento y viejo)
    if (!u) { // cerró sesión → vuelve a invitado
      this.usuario = null; this._guardar();
      try { await (Datos._sesionAnonima ? Datos._sesionAnonima() : A.signInAnonymously(Datos.auth)); } catch (e) { console.warn(e); }
      return;
    }
    const antes = this.usuario && this.usuario.uid === u.uid ? this.usuario : null; // datos guardados de esta misma cuenta
    const correo = String(u.email || "").toLowerCase();
    const tipo = u.isAnonymous ? "invitado"
      : RE_UNT.test(correo) ? "unt"
      : correo.endsWith("@" + DOMINIO_CUENTAS) ? "personal" : "otro";
    let celular = !!u.phoneNumber;
    try { celular = celular || !!(await u.getIdTokenResult()).claims.phone_number; } catch {}
    let esAdmin = antes ? !!antes.esAdmin : false, perfil = null, leido = false;
    if (!u.isAnonymous) {
      try {
        const [a, p] = await Promise.all([F.get(F.ref(Datos.db, `admins/${u.uid}`)), F.get(F.ref(Datos.db, `perfiles/${u.uid}`))]);
        esAdmin = a.val() === true; perfil = p.val(); leido = true;
      } catch (e) { console.warn("Cuenta (sin conexión, se usa lo guardado):", e); }
    }
    if (n !== this._seq) return;
    Datos.uid = u.uid;
    this.usuario = {
      uid: u.uid, tipo, esAdmin, correo, celularVerificado: celular, correoVerificado: !!u.emailVerified,
      nombreUsuario: leido ? (perfil && perfil.usuario) || null : (antes && antes.nombreUsuario) || null,
      registrado: leido ? !!perfil : !!(antes && antes.registrado)
    };
    this._guardar();
    if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("sesion", { detail: this.usuario }));
  },

  registroCompleto() {
    const u = this.usuario;
    return !!(u && ((S.perfiles && S.perfiles[u.uid]) || u.registrado));
  },

  /* null si puede reportar/votar en ese ámbito ("ciudad" | "unt"); si no, el motivo para mostrar */
  motivoNoPuede(ambito) {
    const u = this.usuario;
    if (!u || u.tipo === "invitado") return "Inicia sesión o crea tu cuenta para reportar.";
    if (S.bloqueados && S.bloqueados[u.uid]) return "Tu cuenta fue bloqueada por la autoridad.";
    if (u.esAdmin) return null;
    if (!this.registroCompleto()) return "Completa tu registro.";
    if (u.tipo === "personal") {
      if (!u.celularVerificado) return "Verifica tu celular con el código SMS.";
      if (ambito === "unt") return "Los reportes del campus se hacen con tu cuenta UNT.";
      return null;
    }
    if (u.tipo === "unt") {
      if (!u.correoVerificado) return "Abre el enlace que llegó a tu correo UNT y toca «Ya verifiqué».";
      if (ambito !== "unt") return "Con tu cuenta UNT solo reportas dentro del campus. Para la ciudad usa tu cuenta personal.";
      return null;
    }
    return "Esta cuenta no puede reportar.";
  },

  async usuarioLibre(usuario) {
    const F = Datos.fb;
    return !(await F.get(F.ref(Datos.db, `nombres_usuario/${normalizarUsuario(usuario)}`))).exists();
  },

  /* reCAPTCHA invisible en un contenedor propio (#recaptchaCaja), nuevo en cada envío: así se puede
     reenviar el SMS sin el error "reCAPTCHA has already been rendered in this element". */
  _nuevoVerificador() {
    const A = Datos.authM;
    if (this._verificador) { try { this._verificador.clear(); } catch {} }
    let caja = document.getElementById("recaptchaCaja");
    if (!caja) { caja = document.createElement("div"); caja.id = "recaptchaCaja"; document.body.appendChild(caja); }
    caja.innerHTML = "";
    const div = document.createElement("div");
    div.id = "rc" + Date.now().toString(36);
    caja.appendChild(div);
    this._verificador = new A.RecaptchaVerifier(Datos.auth, div.id, { size: "invisible" });
    return this._verificador;
  },

  /* ---------- Cuenta personal: 3 pasos ---------- */
  /* Paso 1: crea la cuenta y envía el SMS. */
  async registrarPersonal(d) {
    const A = Datos.authM, usuario = normalizarUsuario(d.usuario);
    if (errorUsuario(usuario, "personal")) throw new Error(errorUsuario(usuario, "personal"));
    if (!(await this.usuarioLibre(usuario))) throw new Error("Ese nombre de usuario ya está en uso.");
    try { await A.createUserWithEmailAndPassword(Datos.auth, `${usuario}@${DOMINIO_CUENTAS}`, d.clave); }
    catch (e) {
      if (e.code === "auth/email-already-in-use") throw new Error("Ese nombre de usuario ya está en uso.");
      throw new Error(mensajeError(e));
    }
    this._pendiente = { tipo: "personal", usuario, d };
    try { await this.enviarSMS(celularE164(d.celular)); }
    catch (e) { await this.cancelarRegistro(); throw new Error(mensajeError(e)); }
  },
  async enviarSMS(telefono) {
    const A = Datos.authM;
    this._confirmacion = await A.linkWithPhoneNumber(Datos.auth.currentUser, telefono, this._nuevoVerificador());
  },
  /* Paso 2: confirma el código y guarda los datos. Si algo falla, borra la cuenta recién creada. */
  async confirmarRegistroPersonal(codigo) {
    try { await this._confirmacion.confirm(String(codigo).trim()); }
    catch (e) {
      if (e.code === "auth/invalid-verification-code" || e.code === "auth/code-expired" || e.code === "auth/missing-verification-code") throw new Error(mensajeError(e)); // puede reintentar
      await this.cancelarRegistro(); throw new Error(mensajeError(e));
    }
    const user = Datos.auth.currentUser;
    await user.getIdToken(true); // el token nuevo trae phone_number
    try { await this._guardarDatos(user, this._pendiente.usuario, "personal", this._pendiente.d); }
    catch (e) { await this.cancelarRegistro(); throw new Error("Ese DNI ya tiene una cuenta personal, o el usuario se acaba de ocupar."); }
    this._pendiente = null;
    await this._actualizar(user);
  },
  /* Para quien creó la cuenta personal pero cerró la app antes del código SMS: entra con su usuario,
     vuelve a llenar sus datos y llama esto. Devuelve true si falta el código (luego confirmarRegistroPersonal). */
  async completarRegistroPersonal(d) {
    const u = Datos.auth.currentUser;
    const usuario = String(u.email || "").split("@")[0];
    this._pendiente = { tipo: "personal", usuario, d: { ...d, usuario } };
    if (this.usuario && this.usuario.celularVerificado) { // ya había verificado el SMS: solo guarda
      try { await u.getIdToken(true); await this._guardarDatos(u, usuario, "personal", this._pendiente.d); }
      catch (e) { throw new Error("Ese DNI ya tiene una cuenta personal, o ese celular no es el que verificaste."); }
      this._pendiente = null; await this._actualizar(u); return false;
    }
    try { await this.enviarSMS(celularE164(d.celular)); } catch (e) { throw new Error(mensajeError(e)); }
    return true;
  },
  /* Cuenta UNT a medio registrar (se creó la cuenta pero no se guardaron los datos) */
  async completarRegistroUNT(d) {
    const u = Datos.auth.currentUser;
    try { await this._guardarDatos(u, usuarioFinal(d.usuario, "unt"), "unt", d); }
    catch (e) { throw new Error("Ese DNI ya tiene una cuenta UNT, o el usuario ya está en uso."); }
    if (!u.emailVerified) { try { await Datos.authM.sendEmailVerification(u); } catch {} }
    await this._actualizar(u);
  },
  /* Borra la cuenta a medio crear (sin datos guardados) y vuelve a invitado */
  async cancelarRegistro() {
    const u = Datos.auth.currentUser;
    this._pendiente = null;
    if (u && !u.isAnonymous) { try { await Datos.authM.deleteUser(u); } catch (e) { console.warn(e); await this.salir().catch(() => {}); } }
  },

  /* ---------- Cuenta UNT: se crea y se verifica por correo ---------- */
  async registrarUNT(d) {
    const A = Datos.authM, usuario = usuarioFinal(d.usuario, "unt"), correo = String(d.correo).trim().toLowerCase();
    if (!(await this.usuarioLibre(usuario))) throw new Error("Ese nombre de usuario ya está en uso.");
    let cred;
    try { cred = await A.createUserWithEmailAndPassword(Datos.auth, correo, d.clave); }
    catch (e) {
      if (e.code === "auth/email-already-in-use") throw new Error("Ya existe una cuenta con ese correo UNT. Inicia sesión.");
      throw new Error(mensajeError(e));
    }
    try { await this._guardarDatos(cred.user, usuario, "unt", d); }
    catch (e) { await this.cancelarRegistro(); throw new Error("Ese DNI ya tiene una cuenta UNT, o el usuario se acaba de ocupar."); }
    await A.sendEmailVerification(cred.user); // enlace de verificación al correo UNT
    await this._actualizar(cred.user);
  },
  async reenviarCorreoUNT() { await Datos.authM.sendEmailVerification(Datos.auth.currentUser); },
  async yaVerifique() {
    const u = Datos.auth.currentUser;
    await u.reload(); await u.getIdToken(true); await this._actualizar(Datos.auth.currentUser);
    return this.usuario.correoVerificado;
  },

  async _guardarDatos(user, usuario, tipo, d) {
    const F = Datos.fb, ts = F.serverTimestamp();
    await F.update(F.ref(Datos.db), {
      [`nombres_usuario/${usuario}`]: user.uid,
      [`perfiles/${user.uid}`]: { usuario, avatar: avatarValido(d.avatar) ? d.avatar : AVATAR_DEFECTO, creado: ts },
      [`privado/${user.uid}`]: {
        tipo,
        nombres: String(d.nombres).trim(), apellidos: String(d.apellidos).trim(),
        dni: String(d.dni), celular: celularE164(d.celular),
        correo: tipo === "unt" ? String(user.email).toLowerCase() : String(d.correo).trim().toLowerCase(),
        ...(PEDIR_CONSENTIMIENTO ? { consentimiento: ts } : {}), creado: ts
      },
      [`indice_dni/${tipo}_${d.dni}`]: user.uid
    });
  },

  /* Datos privados de la propia cuenta (solo los lee su dueño) */
  async misDatos() {
    const F = Datos.fb, u = Datos.auth.currentUser;
    if (!u || u.isAnonymous) return null;
    return (await F.get(F.ref(Datos.db, `privado/${u.uid}`))).val();
  },
  async cambiarAvatar(avatar) {
    const F = Datos.fb, u = Datos.auth.currentUser;
    await F.update(F.ref(Datos.db, `perfiles/${u.uid}`), { avatar });
  },

  /* ---------- Entrar / salir ---------- */
  async entrar(usuarioOCorreo, clave) {
    const txt = normalizarUsuario(usuarioOCorreo);
    if (!txt.includes("@") && txt.endsWith(SUFIJO_UNT)) throw new Error("Las cuentas UNT entran con su correo @unitru.edu.pe.");
    try { await Datos.authM.signInWithEmailAndPassword(Datos.auth, correoLogin(usuarioOCorreo), clave); }
    catch (e) { throw new Error(mensajeError(e)); }
  },
  async salir() { await Datos.authM.signOut(Datos.auth); }, // onIdTokenChanged(null) → invitado

  /* ---------- Olvidé mi contraseña ---------- */
  /* Personal: SMS al celular de la cuenta → nueva contraseña */
  async recuperarPersonalEnviar(celular) {
    const A = Datos.authM;
    try { this._confirmacion = await A.signInWithPhoneNumber(Datos.auth, celularE164(celular), this._nuevoVerificador()); }
    catch (e) { throw new Error(mensajeError(e)); }
  },
  async recuperarPersonalConfirmar(codigo, nuevaClave) {
    const A = Datos.authM;
    let r;
    try { r = await this._confirmacion.confirm(String(codigo).trim()); } catch (e) { throw new Error(mensajeError(e)); }
    if (!r.user.email) { // ese celular no tenía cuenta: Firebase creó una vacía → se borra
      await A.deleteUser(r.user).catch(() => {});
      throw new Error("Ese celular no tiene una cuenta personal.");
    }
    try { await A.updatePassword(r.user, nuevaClave); } catch (e) { throw new Error(mensajeError(e)); }
  },
  /* UNT: enlace de cambio de contraseña al correo UNT */
  async recuperarUNT(correo) {
    try { await Datos.authM.sendPasswordResetEmail(Datos.auth, String(correo).trim().toLowerCase()); }
    catch (e) { throw new Error(mensajeError(e)); }
  }
};
/* === CUENTAS (fin) === */

/* === CAMPUS Y REPUTACIÓN (inicio) ====================================
   Geocerca del campus UNT y reputación (usa VOTOS_MIN).
   ===================================================================== */
const CAMPUS_UNT = [ // [lng, lat], del hackaton.kmz (Google Earth), trazado por el equipo
  [-79.038319, -8.109879], [-79.038604, -8.110462], [-79.038836, -8.111034],
  [-79.039287, -8.111825], [-79.03953, -8.112344], [-79.039731, -8.113013],
  [-79.040078, -8.113547], [-79.040518, -8.11414], [-79.040907, -8.114948],
  [-79.041255, -8.115355], [-79.041436, -8.1155], [-79.041662, -8.115366],
  [-79.041261, -8.114408], [-79.040912, -8.113474], [-79.041079, -8.113269],
  [-79.041394, -8.11339], [-79.041885, -8.114034], [-79.044099, -8.1163],
  [-79.040807, -8.119314], [-79.040658, -8.119209], [-79.040466, -8.119161],
  [-79.040405, -8.119171], [-79.040303, -8.119171], [-79.038933, -8.117614],
  [-79.037444, -8.11581], [-79.035991, -8.114105], [-79.03463, -8.112631],
  [-79.03621, -8.111413], [-79.038319, -8.109879]
];
/* Rectángulo que contiene al polígono: es el mismo que usan las reglas de Firebase */
const CAMPUS_BBOX = { latMin: -8.11935, latMax: -8.10985, lngMin: -79.04413, lngMax: -79.03460 };

/* Punto dentro del polígono (ray casting). lat/lng en grados. */
function dentroDelCampus(lat, lng) {
  if (lat < CAMPUS_BBOX.latMin || lat > CAMPUS_BBOX.latMax || lng < CAMPUS_BBOX.lngMin || lng > CAMPUS_BBOX.lngMax) return false;
  let dentro = false;
  for (let i = 0, j = CAMPUS_UNT.length - 1; i < CAMPUS_UNT.length; j = i++) {
    const [xi, yi] = CAMPUS_UNT[i], [xj, yj] = CAMPUS_UNT[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* ---------- Medallas: 5 niveles por REPORTES VERIFICADOS (de gris a dorado) ----------
   Un reporte cuenta como verificado si la autoridad lo verificó o si 3 cuentas distintas lo confirmaron
   (y no lo descartaron). Queda registrado para siempre en /verificados/{autor}/{reporte}: las reglas
   solo aceptan el registro si el reporte de verdad está verificado (comprueban los 3 votos). */
const MEDALLAS = [ // min = reportes verificados para llegar a ese nivel
  { min: 5, nivel: 1, nombre: "Vecino", metal: "gris" },
  { min: 20, nivel: 2, nombre: "Vigía", metal: "bronce" },
  { min: 50, nivel: 3, nombre: "Guardián", metal: "plata" },
  { min: 100, nivel: 4, nombre: "Centinela", metal: "oro" },
  { min: 150, nivel: 5, nombre: "Centinela de la quebrada", metal: "dorado" }
];
const ANTIGUEDAD_MIN_MS = 0; // demo: 0. Uso real: 24 * 60 * 60 * 1000 (los votos de cuentas recién creadas no sirven de prueba)
/* null si aún no llega al primer nivel (menos de 5) */
const medallaDe = (n) => [...MEDALLAS].reverse().find((m) => n >= m.min) || null;
const siguienteMedalla = (n) => MEDALLAS.find((m) => n < m.min) || null;

/* Cuenta los votos de /votos/{id}. */
function contarVotos(votosReporte) {
  let c = 0, n = 0, ultimaConfirmacion = 0;
  for (const x of Object.values(votosReporte || {})) {
    if (!x || (x.v !== 1 && x.v !== -1)) continue;
    if (x.v === 1) { c++; ultimaConfirmacion = Math.max(ultimaConfirmacion, x.t || 0); } else n++;
  }
  return { c, n, ultimaConfirmacion };
}

/* Copia los conteos al reporte EN MEMORIA, para que estadoReporte() siga igual. */
function mezclarVotos(reportes, votos) {
  for (const [id, r] of Object.entries(reportes || {})) {
    if (!r) continue;
    const v = contarVotos(votos && votos[id]);
    r.confirmaciones = v.c; r.negaciones = v.n;
    if (v.ultimaConfirmacion) r.ultimaConfirmacion = v.ultimaConfirmacion;
  }
}

/* ¿El reporte está verificado? (por la autoridad, o 3 confirmaciones sin que lo hayan descartado) */
function reporteVerificado(r) {
  if (!r) return false;
  if (r.verificadoAutoridad === true) return true;
  const c = r.confirmaciones || 0, n = r.negaciones || 0;
  return c >= VOTOS_MIN && !(n > c);
}

/* Prueba que las reglas aceptan para /verificados: {} si lo verificó la autoridad, o 3 uids que lo confirmaron.
   null si todavía no hay prueba. */
function pruebaVerificado(r, votosReporte, perfiles = null) {
  if (!reporteVerificado(r)) return null;
  if (r.verificadoAutoridad === true) return {};
  const uids = Object.entries(votosReporte || {})
    .filter(([uid, x]) => x && x.v === 1 && uid !== r.autor && /^[A-Za-z0-9_-]{1,64}$/.test(uid))
    .filter(([uid, x]) => !perfiles || uid.startsWith("sim_") || (perfiles[uid] && (x.t || 0) - (perfiles[uid].creado || 0) >= ANTIGUEDAD_MIN_MS))
    .map(([uid]) => uid);
  return uids.length >= 3 ? { a: uids[0], b: uids[1], c: uids[2] } : null;
}
/* === CAMPUS Y REPUTACIÓN (fin) === */

/* ---------------------------------------------------------------------
   ESTADO GLOBAL
--------------------------------------------------------------------- */
const S = {
  sensor: null,
  demo: { activo: false, nivel: 0 },
  reportes: {},
  votos: {},                // /votos/{idReporte}/{uid} = { v: 1 | -1, t }
  perfiles: {},             // /perfiles/{uid} = { usuario, avatar, creado } (lo único público de una cuenta)
  bloqueados: {},
  verificados: {},          // /verificados/{autor}/{reporte}: reportes verificados (medallas)
  historial: {},
  ubicacion: null,          // { lat, lng, precision }
  nivelPrevio: undefined,
  vivo: { sensor: false, demo: false },   // ¿llegó el dato del servidor en esta sesión?
  guardado: { sensor: null, demo: null }, // copia guardada en el celular (solo referencia)
  nivelBasePrevio: undefined
};

/* Nivel de la quebrada (sensor o demo). Es el que colorea el cauce y las zonas de sirena. */
function estadoBase() {
  // El nivel 2 (huaico) solo sale de reportes vecinales: un 2 guardado por la versión anterior se lee como "En aumento"
  const oficial = (n) => (n === 2 ? 1 : n);
  if (Datos.modo !== "local") {
    // Mientras no llegue el dato del servidor en esta sesión se usa la copia guardada, marcada como tal
    const g = S.guardado || {};
    const gd = g.demo, gs = g.sensor;
    if (!S.vivo.demo && gd && gd.v && gd.v.activo && nivelValido(Number(gd.v.nivel))) {
      return { nivel: oficial(Number(gd.v.nivel)), fuente: "demo", ts: gd.v.actualizado, cita: gd.v.fuente || "", guardado: true, recibido: gd.t };
    }
    if (!S.vivo.sensor && !(S.vivo.demo && S.demo && S.demo.activo)) {
      if (gs && gs.v && nivelValido(Number(gs.v.nivel))) {
        return { nivel: oficial(Number(gs.v.nivel)), fuente: "autoridad", ts: Number(gs.v.actualizado) || 0, cita: gs.v.fuente || "", guardado: true, recibido: gs.t };
      }
      if (gs && !gs.v) return { nivel: 0, fuente: "sinReportes", guardado: true, recibido: gs.t };
      return { nivel: null, fuente: "sinDatos" };
    }
  }
  if (S.demo && S.demo.activo && nivelValido(Number(S.demo.nivel))) {
    return { nivel: oficial(Number(S.demo.nivel)), fuente: "demo", ts: S.demo.actualizado, cita: S.demo.fuente || "" };
  }
  const s = S.sensor;
  if (!s || !nivelValido(Number(s.nivel))) return { nivel: 0, fuente: "sinReportes" };
  return { nivel: oficial(Number(s.nivel)), fuente: "autoridad", ts: Number(s.actualizado) || 0, cita: s.fuente || "" };
}

/* El estado (y la alarma) es solo el de la quebrada, publicado por la autoridad.
   Los reportes de vecinos se ven en el mapa: no cambian el estado, no hacen sonar nada ni envían avisos. */
function estadoEfectivo() {
  return estadoBase();
}

/* ---------------------------------------------------------------------
   SIRENA (Web Audio API, sin archivos externos)
   Secuencia elegida por el equipo (26/11, a partir de un audio de referencia): tres tonos puros que suben
   520 → 650 → 780 Hz (acorde mayor), de 0,23 s cada uno cada 0,35 s, y una pausa; se repite cada 2,1 s.
--------------------------------------------------------------------- */
/* Armónicos: las mismas notas con timbre de zumbador. Los parlantes de celular casi no reproducen
   520–780 Hz puros; con armónicos la energía cae en 1–5 kHz, donde el parlante y el oído rinden más
   (medido: ~35 dB más en esa banda que el tono puro, más fuerte que la sirena anterior). */
const SIRENA_PATRON = { tonos: [520, 650, 780], paso: 0.35, dura: 0.233, ciclo: 2.1, volumen: 0.9, ataque: 0.02, caida: 0.05,
  armonicos: [1, 0.55, 0.4, 0.25, 0.18, 0.1] };
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
    const c = this.ctx, salida = c.createGain();
    salida.connect(c.destination);
    const nodos = { salida, oscs: new Set(), siguiente: c.currentTime + 0.05, timer: null };
    // Se programan los tonos con varios segundos de anticipación: así no se corta aunque el celular
    // retrase los temporizadores con la pantalla en segundo plano.
    const programar = () => {
      while (nodos.siguiente < c.currentTime + 6) { this._ciclo(nodos, nodos.siguiente); nodos.siguiente += SIRENA_PATRON.ciclo; }
    };
    programar();
    nodos.timer = setInterval(programar, 1000);
    this.nodos = nodos;
  },
  /* Un ciclo: los tres tonos que suben, con entrada y salida suaves (sin chasquidos) */
  _ciclo(nodos, t0) {
    const c = this.ctx, P = SIRENA_PATRON;
    // Onda con armónicos, normalizada a pico 1 (no satura con volumen < 1)
    if (!nodos.onda) nodos.onda = c.createPeriodicWave(new Float32Array(P.armonicos.length + 1), new Float32Array([0, ...P.armonicos]));
    P.tonos.forEach((f, i) => {
      const t = t0 + i * P.paso, osc = c.createOscillator(), g = c.createGain();
      osc.setPeriodicWave(nodos.onda); osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(P.volumen, t + P.ataque);
      g.gain.setValueAtTime(P.volumen, t + P.dura - P.caida);
      g.gain.linearRampToValueAtTime(0, t + P.dura);
      osc.connect(g).connect(nodos.salida);
      osc.start(t); osc.stop(t + P.dura + 0.02);
      nodos.oscs.add(osc);
      osc.onended = () => { nodos.oscs.delete(osc); try { g.disconnect(); } catch {} };
    });
  },
  _parar() {
    if (!this.nodos) return;
    clearInterval(this.nodos.timer);
    for (const o of this.nodos.oscs) { try { o.stop(); } catch {} }
    try { this.nodos.salida.disconnect(); } catch {}
    this.nodos = null;
  },
  async prueba(ms = 4300) { // dos secuencias completas
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

  card.classList.toggle("estado-guardado", !!e.guardado);
  if (e.nivel === null) {
    $("#estadoIcono").innerHTML = ic("radio-tower");
    $("#estadoTitulo").textContent = "Sin datos";
    $("#estadoMensaje").textContent = Red.conectado ? "Recibiendo el estado oficial…" : "Sin conexión y sin un estado guardado en este celular.";
    $("#estadoMeta").textContent = "Escucha la radio local o llama al 115 si llueve fuerte.";
    renderAcciones(["Ten lista tu mochila de emergencia", "Si llueve fuerte, aléjate del cauce", "Sigue la radio y a Defensa Civil"]);
  }
  if (e.nivel !== null) {
    const N = NIVELES[e.nivel];
    $("#estadoIcono").innerHTML = ic(N.icono);
    $("#estadoTitulo").textContent = N.titulo;
    $("#estadoMensaje").textContent = N.mensaje;
    $("#estadoMeta").innerHTML = textoFuente(e);
    renderAcciones(N.acciones);
    if (e.guardado) {
      // Dato guardado: se muestra como referencia, sin alarma ni notificación
      $("#estadoEtiqueta").textContent = "Último dato guardado";
      if (e.nivel === 3) $("#estadoMensaje").textContent = "Fue el último estado recibido. Confirma por radio o llamando al 115.";
      // Con un dato guardado no se dan órdenes como si fueran actuales
      if (e.nivel >= 1) renderAcciones(["Confirma el estado por radio o llamando al 115", "Si ves agua o lodo cerca, sube a zona alta", "Ten lista tu mochila de emergencia"]);
    } else if (Datos.modo === "firebase" && !Red.conectado) {
      $("#estadoMeta").innerHTML = `${textoFuente(e)}<br><span class="aviso-offline">Sin conexión desde las ${hora(Red.desde)}: puede estar desactualizado</span>`;
    }
  }

  // Emergencia (rojo): solo con un dato recibido del servidor en esta sesión, nunca con uno guardado
  const rojo = e.nivel === 3 && !e.guardado;
  document.body.classList.toggle("emergencia", rojo);
  $("#bannerEmergencia").hidden = !rojo;
  if (!rojo) cerrarAlarma();
  if (rojo) {
    $("#emergenciaTitulo").textContent = "Desborde: evacúa ahora";
    $("#bannerEmergenciaTitulo").textContent = "Desborde: evacúa ahora";
    $("#listaZonasSirena").innerHTML = `<li>Sirenas activas en ${ZONAS_SIRENA.map((z) => esc(z.nombre)).join(", ").replace(/, ([^,]*)$/, " y $1")}</li>`;
    $("#emergenciaFuente").innerHTML = textoFuente(e);
  }
  actualizarBotonesSirena();
}
/* "Fuente: Parte COER La Libertad · 21:40" (o SIMULADO en la demo). Sin reporte: lo dice. */
function textoFuente(e) {
  if (e.guardado) {
    const cita = e.fuente === "sinReportes" ? "Sin reportes oficiales" : (e.fuente === "demo" ? "SIMULADO · " : "") + esc(e.cita || "Autoridad");
    return `${cita}${e.ts ? ` · ${hora(e.ts)}` : ""}<br><span class="aviso-offline">Guardado a las ${hora(e.recibido)} · ${Red.conectado ? "actualizando" : "sin conexión"}, puede estar desactualizado</span>`;
  }
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
  if (e.guardado || e.nivel === null) {
    // Un dato guardado no dispara alarma, sirena ni notificación
    if (mapa) pintarCauceYZonas();
    if (typeof renderGuia === "function") renderGuia();
    return;
  }
  const n = e.nivel;
  if (n !== S.nivelBasePrevio) { S.nivelBasePrevio = n; if (mapa) pintarCauceYZonas(); }
  if (n === S.nivelPrevio) return;
  const previo = S.nivelPrevio;
  S.nivelPrevio = n;
  if (n === 3 && previo !== 3) abrirAlarma();
  if (typeof renderGuia === "function") renderGuia();

  if (n === 3) Sirena.iniciar(); else Sirena.detener();
  // Regla del proyecto: solo notifica el estado de la autoridad (o la simulación). Los reportes de vecinos no.
  gestionarNotificacion(n);

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
    S.climaGuardado = null;
    Cache.guardar("clima", S.clima);
    renderClima();
  } catch (e) {
    console.warn("Clima:", e);
    const g = Cache.leer("clima");
    if (g && g.v && Date.now() - g.t < 24 * 3600 * 1000) {
      S.clima = g.v; S.climaGuardado = g.t;
      renderClima();
      return;
    }
    S.clima = null;
    $("#climaCuerpo").innerHTML = cwHtmlError();
    $("#climaFuente").innerHTML = `Open-Meteo no respondió · ${hora(Date.now())}` + enlaceClimaExterno();
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
        <div><span class="k">Sensación térmica</span><span class="v">${fmt(c.apparent_temperature, "°", 0)}</span></div>
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

/* Pronóstico completo FUERA de la app (Windy, gratis): misma ubicación que el clima de Inicio.
   Formato https://www.windy.com/LAT/LON (abre el detalle del punto); lat/lon con parte decimal. */
function enlaceClimaExterno() {
  const lat = (S.ubicacion ? S.ubicacion.lat : TRUJILLO.lat).toFixed(3);
  const lng = (S.ubicacion ? S.ubicacion.lng : TRUJILLO.lng).toFixed(3);
  return `<a class="clima-externo" href="https://www.windy.com/${lat}/${lng}" target="_blank" rel="noopener">Ver pronóstico completo ${ic("external-link")}</a>`;
}
function renderClima() {
  const K = S.clima; if (!K) return;
  $("#climaCuerpo").innerHTML = cwHtmlFila(K);
  $("#climaFuente").innerHTML = (S.climaGuardado
    ? `Guardado · Open-Meteo ${esc(K.c.time.slice(11, 16))} (no se pudo actualizar)`
    : `Open-Meteo · ${esc(K.c.time.slice(11, 16))}`) + enlaceClimaExterno();
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
        renderTodo();
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
  // Cauce: oculto por defecto (se muestra con su botón del mapa)
  capas.cauce = L.layerGroup();
  capas.bloqueos = L.layerGroup().addTo(mapa);
  capas.reportes = L.layerGroup().addTo(mapa);
  capas.evac = L.layerGroup().addTo(mapa);
  capas.seguros = L.layerGroup(); // zonas de refugio: solo se muestran con DESBORDE (ver pintarCauceYZonas)
  // Capas de cartografía municipal (ocultas hasta activarlas con su botón)
  capas.buzonetas = L.layerGroup();
  mapa.on("zoomend", () => { if (mapa.hasLayer(capas.buzonetas)) pintarBuzonetas(); });
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
  pintarCampus();
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
    const ir = ev.target.closest("[data-cuenta-ir]");
    if (ir) { ev.preventDefault(); mapa.closePopup(); if (puertaCuenta(ir.dataset.cuentaIr)) abrirCuenta("micuenta"); return; }
    const b = ev.target.closest("[data-voto]");
    if (!b) return;
    ev.preventDefault();
    const rv = S.reportes[b.dataset.id];
    if (Datos.modo !== "local" && !puertaCuenta(rv && rv.ambito === "unt" ? "unt" : "ciudad")) { mapa.closePopup(); return; }
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
    if (sinServidor("tu respuesta no se registró")) { b.disabled = false; return; }
    try {
      const ok = await conTiempo(Datos.votar(b.dataset.id, Number(b.dataset.voto)), 15000);
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
  const txtNivel = (e.nivel === null ? "Sin datos del sensor" : NIVELES[e.nivel].corto) + (e.guardado ? " (dato guardado, puede estar desactualizado)" : "");
  capas.cauce.clearLayers();
  // Zonas de refugio (escudos): solo cuando hay DESBORDE (oficial o simulado)
  if (e.nivel === 3) capas.seguros.addTo(mapa); else capas.seguros.remove();
  if (!$("#leyendaMapa").hidden) renderLeyenda();
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
      <span class="item-titulo">${esc(T.nombre)}${trazoDe(x.r) ? ` (tramo de ${Math.round(x.r.largo || 0)} m)` : ""}${x.r.ambito === "unt" ? '<span class="etiqueta-campus">Campus UNT</span>' : ""}</span>
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
/* ---------------------------------------------------------------------
   CARTOGRAFÍA MUNICIPAL: Buzonetas
   Archivos estáticos en datos/ (rutas relativas: funcionan bajo /previunt/). No usan Firebase.
--------------------------------------------------------------------- */
const FUENTE_PLANES_MPT = "https://www.gob.pe/institucion/munitrujillo/informes-publicaciones/7861873-planes-de-contingencia";
const ARCHIVOS_CARTO = { buzonetas: "datos/buzonetas-trujillo-2026.geojson" };
const Carto = { buzonetas: undefined }; // undefined = sin pedir; null = no se pudo cargar

async function cargarGeojson(ruta) {
  try {
    const r = await fetch(ruta, { cache: "no-cache" });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.features) ? d : null;
  } catch (e) { console.warn("Cartografía:", ruta, e); return null; }
}

/* ----- Buzonetas de captación pluvial (30, plan 2026) ----- */
const RIESGO_BUZ = {
  alto:     { texto: "Riesgo alto según plan 2026",     clase: "buz-alto", letra: "A" },
  moderado: { texto: "Riesgo moderado según plan 2026", clase: "buz-mod",  letra: "M" }
};
let buzPuntos = null; // [{ id, ll, p }]
async function activarBuzonetas(on) {
  if (!on) { capas.buzonetas.remove(); renderLeyenda(); return; }
  capas.buzonetas.addTo(mapa);
  if (Carto.buzonetas === undefined) {
    Carto.buzonetas = await cargarGeojson(ARCHIVOS_CARTO.buzonetas);
    // GeoJSON viene en [longitud, latitud]: se convierte con la función de Leaflet, sin mover los puntos
    buzPuntos = Carto.buzonetas ? Carto.buzonetas.features
      .filter((f) => f.geometry?.type === "Point")
      .map((f) => ({ id: f.properties.id || f.id, ll: L.GeoJSON.coordsToLatLng(f.geometry.coordinates), p: f.properties })) : null;
  }
  if (!buzPuntos) toast("No se pudo cargar la capa de buzonetas. Revisa tu conexión.");
  pintarBuzonetas();
  renderLeyenda();
}
const iconoBuz = (p) => {
  const R = RIESGO_BUZ[p.riesgo] || RIESGO_BUZ.moderado;
  return L.divIcon({ className: "", html: `<div class="mk-buz ${R.clase}">${ic("rejilla")}<span class="buz-letra" aria-hidden="true">${R.letra}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
};
function popupBuz(b) {
  const p = b.p, R = RIESGO_BUZ[p.riesgo] || RIESGO_BUZ.moderado;
  return `<strong>${esc(b.id)} · ${esc(p.nombre)}</strong>
    <br>${esc(p.referencia || "")}
    <br><span class="clasif ${R.clase}">${R.letra === "A" ? "▲" : "●"} ${esc(R.texto)}</span>
    <br><span class="cuenta">La clasificación es la del punto de aniego en el plan. No es un aviso en tiempo real ni indica si la buzoneta funciona.</span>
    <br><span class="cuenta">Fuente: MPT, Plan de Acción ante Lluvias Intensas y Peligros Asociados 2026, anexos 15.1 (tabla 13) y 15.2 (mapa 2). Coordenadas convertidas de la tabla UTM del plan. <a href="${FUENTE_PLANES_MPT}" target="_blank" rel="noopener">Ver planes</a></span>`;
}
/* Agrupa las buzonetas que se tocan en pantalla (zoom bajo); al acercarse se ven una por una */
function pintarBuzonetas() {
  capas.buzonetas.clearLayers();
  if (!buzPuntos) return;
  const sueltas = mapa.getZoom() >= 15;
  const grupos = [];
  buzPuntos.forEach((b) => {
    const px = mapa.latLngToLayerPoint(b.ll);
    const g = sueltas ? null : grupos.find((x) => x.px.distanceTo(px) < 34);
    if (g) g.items.push(b); else grupos.push({ px, items: [b] });
  });
  grupos.forEach((g) => {
    if (g.items.length === 1) {
      const b = g.items[0];
      L.marker(b.ll, { icon: iconoBuz(b.p), title: `${b.id} · ${b.p.nombre}` })
        .bindPopup(() => popupBuz(b), { maxWidth: 270, autoPanPaddingTopLeft: [12, 70], autoPanPaddingBottomRight: [12, 150] })
        .addTo(capas.buzonetas);
      return;
    }
    const altos = g.items.filter((b) => b.p.riesgo === "alto").length;
    const lim = L.latLngBounds(g.items.map((b) => b.ll));
    L.marker(lim.getCenter(), {
      icon: L.divIcon({ className: "", html: `<div class="mk-buz-grupo${altos ? " con-alto" : ""}">${ic("rejilla")}<span>${g.items.length}</span></div>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
      title: `${g.items.length} buzonetas: acerca el mapa para verlas`, keyboard: true
    }).on("click", () => mapa.fitBounds(lim.pad(0.4), { maxZoom: 16 })).addTo(capas.buzonetas);
  });
}

/* Leyenda: se arma según las capas activas */
const muestraLinea = (estilo) => `<svg class="ley-linea" viewBox="0 0 40 10" aria-hidden="true"><line x1="2" y1="5" x2="38" y2="5" style="${estilo}"/></svg>`;
function renderLeyenda() {
  const cuerpo = $("#leyendaCuerpo"); if (!cuerpo) return;
  const activa = (c) => $(`.chip[data-capa="${c}"]`)?.getAttribute("aria-pressed") === "true";
  const partes = [];
  partes.push(`<h3>Mapa</h3><ul class="ley-lista">
    <li><span class="ley-pin ley-gris" aria-hidden="true"></span>Reporte vecinal sin validar</li>
    <li><span class="ley-pin" aria-hidden="true"></span>Reporte confirmado por vecinos</li>
    <li>${muestraLinea("stroke:#2E7D32;stroke-width:3;stroke-dasharray:2 5;stroke-linecap:round")}Cauce de la quebrada (trazado referencial; color según el nivel)</li>
    ${estadoBase().nivel === 3 ? `<li><span class="mk mk-refugio mk-ley" aria-hidden="true">${ic("shield-check")}</span>Zona de refugio (ANA 2015)</li>` : ""}</ul>`);
  if (activa("buzonetas")) {
    const n = buzPuntos ? buzPuntos.length : 0;
    const altos = buzPuntos ? buzPuntos.filter((b) => b.p.riesgo === "alto").length : 0;
    partes.push(`<h3>Buzonetas de captación pluvial</h3>
      <ul class="ley-lista">
        <li><span class="mk-buz buz-alto mk-ley">${ic("rejilla")}<span class="buz-letra">A</span></span>▲ Riesgo alto según plan 2026${buzPuntos ? ` (${altos})` : ""}</li>
        <li><span class="mk-buz buz-mod mk-ley">${ic("rejilla")}<span class="buz-letra">M</span></span>● Riesgo moderado según plan 2026${buzPuntos ? ` (${n - altos})` : ""}</li>
        <li><span class="mk-buz-grupo mk-ley">${ic("rejilla")}<span>5</span></span>Varias buzonetas juntas: acerca el mapa</li>
      </ul>
      <p class="meta">${buzPuntos ? `${n} buzonetas del plano del plan 2026.` : "No se pudo cargar la capa."} La clasificación describe el punto de aniego en el plan; no es un aviso en tiempo real ni el estado de la buzoneta.</p>
      <p class="fuente">Fuente: MPT, Plan de Acción ante Lluvias Intensas y Peligros Asociados 2026, anexos 15.1 y 15.2.</p>`);
  }
  cuerpo.innerHTML = partes.join("");
}
function abrirLeyenda(abrir) {
  $("#leyendaMapa").hidden = !abrir;
  $("#btnLeyenda").setAttribute("aria-expanded", String(abrir));
  if (abrir) renderLeyenda();
}
/* Desde Noticias: abrir el mapa con una capa encendida */
function verCapaEnMapa(capa) {
  irATab("mapa");
  const chip = $(`.chip[data-capa="${capa}"]`);
  if (chip && chip.getAttribute("aria-pressed") !== "true") chip.click();
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
  const local = Datos.modo === "local";
  const yaVote = local ? !!(r.votos && r.votos[Datos.uid]) : !!(S.votos && S.votos[id] && S.votos[id][Datos.uid]);
  const amb = r.ambito === "unt" ? "unt" : "ciudad";
  const motivo = local || esMio || yaVote ? null : Cuenta.motivoNoPuede(amb);
  let nota = "";
  if (esMio) nota = "Es tu reporte: otros lo confirmarán.";
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
      <div><h4>${ic(T.icono)} ${esc(T.nombre)}${amb === "unt" ? '<span class="etiqueta-campus">Campus UNT</span>' : ""}</h4>
      <span class="cuenta">${estado} · ${hace(r.creado)}${trazoDe(r) ? ` · tramo de ${Math.round(r.largo || 0)} m` : ""}</span></div>
    </div>
    ${htmlAutor(r)}
    ${r.fotoPendiente && !r.tieneFoto ? '<p class="cuenta"><span class="spinner spinner-chico" aria-hidden="true"></span>Subiendo la foto…</p>' : ""}
    ${r.descripcion ? `<p class="popup-desc">${esc(r.descripcion)}</p>` : ""}
    ${gestionDe(r) === "en_atencion" ? `<p class="gestion-nota">${ic("shield-user")}La autoridad lo está atendiendo</p>` : ""}
    <p class="pregunta">¿Sigue este problema?</p>
    ${motivo ? `<p class="nota-voto">${esc(motivo)} <button type="button" class="btn-texto" data-cuenta-ir="${amb}">${Cuenta.usuario && Cuenta.usuario.tipo !== "invitado" ? "Ver mi cuenta" : "Iniciar sesión"}</button></p>` : `<div class="votos">
      <button class="si" data-voto="1" data-id="${esc(id)}" ${dis}>${ic("check")}Confirmar</button>
      <button data-voto="-1" data-id="${esc(id)}" ${dis}>${ic("x")}Ya no está</button>
    </div>`}
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

/* El peligro del que hay que alejarse: el cauce de la quebrada */
function peligroActual() {
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
const R = { tipo: null, foto: null, lat: null, lng: null, origenUbic: null, forma: "punto", trazo: null, metodoTrazo: null, largo: null, ambito: null };
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
  $("#btnElegirMapa").hidden = proximidadActiva() || R.ambito === "unt"; // en el campus vale solo el GPS
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
    Object.assign(R, { tipo: null, foto: null, lat: null, lng: null, origenUbic: null, forma: "punto", trazo: null, metodoTrazo: null, largo: null, ambito: null });
    elegirForma("punto");
    $("#formReporte").reset();
    $$(".opcion-tipo").forEach((b) => b.setAttribute("aria-pressed", "false"));
    $("#previewFoto").hidden = true;
    $("#contadorDesc").textContent = "0";
    actualizarDetalleRequerido(); mostrarErrorDesc(null);
    $("#textoUbicacion").textContent = "Sin ubicación todavía.";
    if (marcadorTemp) { marcadorTemp.remove(); marcadorTemp = null; }
    if (capaTemp) { capaTemp.remove(); capaTemp = null; }
  }
}
/* "Otros": el detalle pasa a ser obligatorio. Al volver a otra categoría vuelve a ser opcional y el texto se conserva. */
function actualizarDetalleRequerido() {
  const req = !!TIPOS_REPORTE[R.tipo]?.descObligatoria;
  const t = $("#inputDesc");
  t.required = req; t.setAttribute("aria-required", String(req));
  $("#etqDesc").textContent = req ? "Describe lo que ocurrió" : "Detalle";
  $("#marcaDesc").textContent = req ? "obligatorio" : "opcional";
  $("#marcaDesc").className = req ? "requerido" : "opcional";
  t.placeholder = req ? "Ej.: hay un árbol caído en la vía" : "Ej.: agua acumulada en la esquina, no pasan autos";
  if (!req) mostrarErrorDesc(null);
}
function mostrarErrorDesc(msg) {
  $("#errorDesc").hidden = !msg;
  if (msg) $("#errorDesc").textContent = msg;
  $("#inputDesc").setAttribute("aria-invalid", String(!!msg));
  $("#fsDetalle").classList.toggle("con-error", !!msg);
}
function validarFormReporte() {
  const ubicOK = R.forma === "tramo" ? !!(R.trazo && R.trazo.length >= 2) : typeof R.lat === "number";
  const campusOK = R.ambito !== "unt" || Geocerca.enCampus;
  $("#btnEnviarReporte").disabled = !(R.tipo && ubicOK && campusOK);
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
    R.tipo = b.dataset.tipo; actualizarDetalleRequerido(); validarFormReporte();
  });
  $("#inputFoto").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    $("#previewFoto").hidden = true; $("#cargandoFoto").hidden = false; // circulito mientras se reduce la foto
    try {
      if (f.size > 25 * 1024 * 1024) throw new Error("La foto es demasiado grande. Elige otra.");
      let foto = await comprimirImagen(f);
      if (foto.length > LIMITE_FOTO_CHARS) foto = await comprimirImagen(f, 640, 0.5);
      if (foto.length > LIMITE_FOTO_CHARS) throw new Error("No se pudo reducir esta foto lo suficiente. Prueba con otra.");
      R.foto = foto;
      $("#imgPreview").src = R.foto; $("#previewFoto").hidden = false;
    } catch (err) { toast(err.message); }
    finally { $("#cargandoFoto").hidden = true; }
  });
  $("#btnQuitarFoto").onclick = () => { R.foto = null; $("#inputFoto").value = ""; $("#previewFoto").hidden = true; $("#cargandoFoto").hidden = true; };
  $("#inputDesc").addEventListener("input", (e) => {
    $("#contadorDesc").textContent = e.target.value.length;
    if (!$("#errorDesc").hidden && !errorDescripcion(R.tipo, e.target.value)) mostrarErrorDesc(null);
  });
  $("#inputDesc").addEventListener("blur", (e) => { if (R.tipo && e.target.value.length) mostrarErrorDesc(errorDescripcion(R.tipo, e.target.value)); });
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
  $$(".opcion-ambito").forEach((b) => b.addEventListener("click", () => {
    if (b.disabled || R.ambito === b.dataset.ambito) return;
    elegirAmbito(b.dataset.ambito);
    if (R.ambito === "ciudad" && R.lat === null) usarGPSReporte();
  }));
  $("#btnMarcarTramo").onclick = marcarTramo;
  $("#btnCerrarReporte").onclick = () => cerrarReporte(true);
  $("#hojaReporte").addEventListener("click", (e) => { if (e.target.id === "hojaReporte") cerrarReporte(false); });

  $("#formReporte").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("#btnEnviarReporte").disabled) return;
    // "Otros" sin descripción: no se guarda ni se envía; los datos del formulario se conservan
    const errDesc = errorDescripcion(R.tipo, $("#inputDesc").value);
    if (errDesc) { mostrarErrorDesc(errDesc); $("#inputDesc").focus(); return; }
    if (Datos.modo !== "local") {
      const motivo = Cuenta.motivoNoPuede(R.ambito || "ciudad");
      if (motivo) { cerrarReporte(false); puertaCuenta(R.ambito || "ciudad", abrirReporteNuevo); return; }
      if (R.ambito === "unt") {
        // Se comprueba otra vez al enviar: dentro del campus, lectura de menos de 60 s y precisión de 60 m o mejor
        if (!lecturaCampusValida()) {
          $("#textoUbicacion").textContent = Geocerca.enCampus
            ? "Esperando una lectura reciente y precisa del GPS (60 m o mejor). Intenta en unos segundos."
            : "Saliste del campus UNT: no puedes enviar este reporte.";
          return;
        }
        R.lat = Geocerca.ultimo.lat; R.lng = Geocerca.ultimo.lng; R.forma = "punto"; R.trazo = null;
      }
    }
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
    btn.disabled = true; btn.textContent = "Guardando…";
    const datos = {
      tipo: R.tipo,
      descripcion: $("#inputDesc").value.trim().slice(0, 200),
      lat: Number(R.lat.toFixed(6)), lng: Number(R.lng.toFixed(6)),
      forma: R.forma,
      ambito: R.ambito === "unt" ? "unt" : "ciudad",
      ...(R.forma === "tramo" ? { trazo: R.trazo, largo: R.largo, metodoTrazo: R.metodoTrazo } : {})
    };
    try {
      if (Datos.modo === "local") {
        await Datos.addReporte({ ...datos, foto: R.foto || null });
        toast("Reporte guardado en modo local (sin Firebase).");
      } else {
        // Primero se guarda en el celular; luego se envía (datos y después la foto)
        await Cola.agregar(datos, R.foto || null);
        toast(Red.conectado && Datos.uid ? "Enviando tu reporte…" : "Sin conexión: tu reporte quedó guardado y se enviará cuando vuelva la señal.", 5000);
      }
      cerrarReporte(true);
    } catch (err) {
      console.error(err); toast("No se pudo guardar el reporte: " + err.message, 5000);
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
  // Solo los estados que publica la autoridad (Seco, En aumento, Desborde): no hay nivel de huaico por vecinos
  const sel = NIVELES_AUTORIDAD.includes(nivelGuia) ? nivelGuia : (NIVELES_AUTORIDAD.includes(actual) ? actual : 0);
  const N = NIVELES[sel], g = GUIA_NIVELES[sel] || {};
  const bloque = (t, arr) => arr ? `<h4>${t}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  cont.innerHTML = `<div class="niveles-sel" role="group" aria-label="Elegir nivel">${NIVELES.filter((M) => NIVELES_AUTORIDAD.includes(M.n)).map((M) =>
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

  renderNumeros();
  renderConocenos();
}

/* Números: tarjeta con ícono de teléfono, número destacado y nombre del centro (un toque para llamar) */
const tarjetaNumero = (n, ancho) =>
  `<li class="${ancho ? "ancho" : ""}"><a href="tel:${esc(n.tel || n.numero)}">${ic("phone")}<span><span class="num">${esc(n.mostrar || n.numero)}</span><span class="nombre">${esc(n.nombre)}</span></span></a></li>`;
function renderNumeros() {
  $("#listaNumeros").innerHTML = NUMEROS_EMERGENCIA.map((n) => tarjetaNumero(n, false)).join("");
  $("#directorioNumeros").innerHTML = DIRECTORIO_EMERGENCIA.map((j) => `
    <div class="jurisdiccion" data-jurisdiccion="${esc(j.id)}">
      <h3 class="jurisdiccion-tit">Centros de operaciones de emergencia <span class="pill">${esc(j.cobertura)}</span></h3>
      <ul class="numeros">${j.centros.map((n) => tarjetaNumero(n, true)).join("")}</ul>
      ${j.otros?.length ? `<h3 class="jurisdiccion-tit">Otros teléfonos</h3><ul class="numeros">${j.otros.map((n) => tarjetaNumero(n, true)).join("")}</ul>` : ""}
    </div>`).join("");
}

/* Noticias: primero las más recientes */
const fechaLarga = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
};
let noticiasCargadas = null; // null = sin pedir; [] = vacío o error
async function cargarNoticias() {
  if (noticiasCargadas) return noticiasCargadas;
  const ul = $("#listaNoticias");
  ul.innerHTML = '<li class="meta">Cargando noticias…</li>';
  try {
    const r = await fetch(RUTA_NOTICIAS + "noticias.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error("Formato no válido");
    noticiasCargadas = d.filter((n) => n && n.titulo && n.fuente);
  } catch (e) {
    console.warn("Noticias:", e);
    ul.innerHTML = '<li class="meta">Sin datos disponibles: no se pudieron cargar las noticias. Revisa tu conexión.</li>';
    return null;
  }
  renderNoticias();
  return noticiasCargadas;
}
const fechaValida = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);
function renderNoticias() {
  if (!noticiasCargadas) return;
  const sinFecha = noticiasCargadas.filter((n) => !fechaValida(n.fecha));
  const fechadas = noticiasCargadas.filter((n) => fechaValida(n.fecha)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lista = sinFecha.concat(fechadas);
  // La imagen solo se acepta como archivo dentro de noticias/ (sin rutas externas)
  const rutaImg = (f) => typeof f === "string" && /^[\w.-]+\.(webp|jpe?g|png)$/i.test(f) ? RUTA_NOTICIAS + f : null;
  $("#listaNoticias").innerHTML = lista.length ? lista.map((n) => {
    const E = n.estado ? ESTADO_NOTICIA[n.estado] : null;
    const img = rutaImg(n.imagen);
    const historica = n.tipo === "Archivo";
    return `<li class="noticia" id="noticia-${esc(n.id || "")}">
      <article${historica ? ' class="noticia-archivo"' : ""}>
        ${img ? `<figure class="noticia-img">
          <img src="${esc(img)}" alt="${esc(n.imagenAlt || "")}" loading="lazy" decoding="async" width="640" height="360">
          ${n.creditoImagen ? `<figcaption>Imagen: <a href="${esc(n.fuente)}" target="_blank" rel="noopener">${esc(n.creditoImagen)}</a></figcaption>` : ""}
        </figure>` : ""}
        <div class="noticia-texto">
          <div class="noticia-meta">
            ${fechaValida(n.fecha) ? `<time datetime="${esc(n.fecha)}">${esc(fechaLarga(n.fecha))}</time>` : ""}
            ${historica ? '<span class="estado-noticia estado-archivo">Archivo · nota histórica</span>' : ""}
            ${E ? `<span class="estado-noticia estado-${esc(n.estado)}">${ic(E.icono)}${esc(E.texto)}</span>` : ""}
          </div>
          <h2 class="noticia-tit">${esc(n.titulo)}</h2>
          <p class="noticia-resumen">${esc(n.resumen || "")}</p>
          <p class="noticia-datos"><span><strong>Entidad:</strong> ${esc(n.entidad || "")}</span>${n.zona ? `<span><strong>Dónde:</strong> ${esc(n.zona)}</span>` : ""}</p>
          <a class="btn btn-secundario btn-chico noticia-btn" href="${esc(n.fuente)}" target="_blank" rel="noopener">Ver publicación</a>
        </div>
      </article></li>`;
  }).join("") : '<li class="meta">Aún no hay noticias.</li>';
  // Si una imagen no está en el repositorio, la tarjeta se muestra igual, sin imagen
  $$("#listaNoticias .noticia-img img").forEach((im) => im.addEventListener("error", () => im.closest("figure").remove(), { once: true }));
}
function renderConocenos() {
  const conDatos = EQUIPO.filter((p) => p && p.nombre);
  $("#bloqueEquipo").hidden = conDatos.length === 0;
  $("#introEquipo").textContent = INTRO_EQUIPO;
  $("#textoMotivacion").innerHTML = MOTIVACION.map((p) => `<p>${esc(p)}</p>`).join("");
  $("#listaEquipo").innerHTML = conDatos.map((p) => `<li class="persona">
      ${p.foto ? `<img class="persona-foto" src="${esc(p.foto)}" alt="" loading="lazy">` : `<span class="persona-foto persona-ini" aria-hidden="true">${esc(p.nombre.trim().charAt(0).toUpperCase())}</span>`}
      <span><strong class="persona-nombre">${esc(p.nombre)}</strong>
      ${p.rol ? `<span class="persona-rol">${esc(p.rol)}</span>` : ""}
      ${p.aporte ? `<span class="persona-aporte">${esc(p.aporte)}</span>` : ""}</span></li>`).join("");
}

/* Pestañas internas de Info (Prepárate | Noticias | Conócenos), con teclado y aria-selected */
const SUBTABS_INFO = ["preparate", "noticias", "conocenos"];
let subInfo = "preparate";
function elegirSubInfo(nombre, foco = false) {
  if (!SUBTABS_INFO.includes(nombre)) nombre = "preparate";
  subInfo = nombre;
  SUBTABS_INFO.forEach((n) => {
    const t = $("#subtab-" + n), p = $("#panel-" + n);
    const on = n === nombre;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    p.hidden = !on;
  });
  if (nombre === "noticias") cargarNoticias();
  if (foco) $("#subtab-" + nombre).focus();
}
function prepararSubtabs() {
  const lista = $(".subtabs");
  lista.addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) elegirSubInfo(b.dataset.sub); });
  lista.addEventListener("keydown", (e) => {
    const i = SUBTABS_INFO.indexOf(subInfo);
    const destino = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    elegirSubInfo(SUBTABS_INFO[destino], true);
  });
  $("#listaNoticias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ver-capa]"); if (!b) return;
    verCapaEnMapa(b.dataset.verCapa);
  });
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
/* Con Firebase el rol es real: solo las cuentas marcadas en /admins (las reglas lo exigen). Sin Firebase (modo local)
   se mantiene el acceso oculto para hacer la demo sin internet. */
const esAutoridad = () => firebaseConfigurado()
  ? !!(Cuenta.usuario && Cuenta.usuario.esAdmin)
  : lsGet("previunt_autoridad", false) === true;
let filtroGestion = "pendiente";
function aplicarModoAutoridad() {
  const on = esAutoridad();
  document.body.classList.toggle("autoridad", on);
  $(".nav-autoridad").hidden = !on;
  $("#badgeAutoridad").hidden = !on;
  if (!on && $("#tab-control").classList.contains("activa")) irATab("inicio");
  $("#btnSalirAutoridad").lastChild.textContent = firebaseConfigurado() ? "Cerrar sesión" : "Salir";
}
function abrirAdmin() { if (firebaseConfigurado()) return; lsSet("previunt_autoridad", true); aplicarModoAutoridad(); irATab("control"); renderAdmin(); }

/* Renueva la vigencia del desborde vigente (mismo eventId: los ESP32 no lo cuentan como alarma nueva) */
async function renovarAlerta(manual) {
  const s = S.sensor;
  if (!esAutoridad() || Datos.modo !== "firebase" || !Red.conectado || !s || s.nivel !== 3 || !s.eventId) return;
  const quedan = Number(s.validUntil || 0) - Math.floor(ahora() / 1000);
  if (!manual && (document.visibilityState !== "visible" || quedan > 20 * 60)) return;
  try {
    await Datos.publicarEstado(3, s.fuente || "", { eventId: s.eventId, actualizado: Number(s.actualizado) || ahora() });
    if (manual) toast("Desborde renovado por 1 hora para la sirena física.");
  } catch (e) { console.warn("No se pudo renovar la alerta:", e); if (manual) toast("No se pudo renovar: " + e.message); }
}

function renderAdmin() {
  if (!esAutoridad()) return;
  const e = estadoEfectivo();
  const eb = estadoBase();
  $$(".btn-nivel").forEach((b) => b.classList.toggle("actual", eb.nivel === Number(b.dataset.nivel) && eb.fuente !== "sinReportes"));
  $("#chkProximidad").checked = proximidadActiva();
  $("#btnDemoOff").hidden = !S.demo?.activo;
  $("#adminEstadoDemo").textContent = (S.demo?.activo ? `Simulación activa: ${NIVELES[S.demo.nivel]?.corto || S.demo.nivel}` : eb.fuente === "autoridad" ? `Estado oficial: ${NIVELES[eb.nivel].corto} · ${eb.cita || "sin fuente"}` : "Sin estado oficial publicado.");
  const yo = Cuenta.usuario && (perfilDe(Cuenta.usuario.uid)?.usuario || Cuenta.usuario.nombreUsuario);
  $("#adminConexion").innerHTML = Datos.modo === "firebase"
    ? `Conectado como <strong>${esc(yo || "admin")}</strong> (admin)`
    : `Modo LOCAL (sin Firebase): datos solo en este navegador · usuario <code>${esc(String(Datos.uid).slice(0, 8))}…</code>`;
  const s = S.sensor;
  $("#adminSensor").innerHTML = s
    ? `Último estado oficial: ${esc(NIVELES[s.nivel]?.corto ?? s.nivel)} · ${esc(s.fuente || "sin fuente")} · ${fechaHora(Number(s.actualizado))}`
    : "Aún no se publicó un estado oficial.";
  // Sirena física: vigencia del evento que leen los ESP32
  const vence = s && Number(s.validUntil) ? Number(s.validUntil) * 1000 : 0;
  $("#adminSirenaFisica").innerHTML = !s || !s.eventId
    ? "Sirena física: todavía no hay un estado publicado con la versión nueva (se crea al publicar)."
    : vence > ahora()
      ? `Sirena física (zona <code>${esc(s.zona)}</code>): ${s.nivel === 3 ? "<strong>DESBORDE</strong>" : NIVELES[s.nivel]?.corto ?? s.nivel} vigente hasta ${hora(vence)}${s.nivel === 3 ? " · se renueva sola mientras tengas Control abierto" : ""}.`
      : `Sirena física: el último estado venció a las ${hora(vence)}. Los ESP32 lo toman como despeje.${s.nivel === 3 ? " Si el desborde sigue, toca «Renovar»." : ""}`;
  $("#btnRenovarAlerta").hidden = !(Datos.modo === "firebase" && s && s.eventId && s.nivel === 3);

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
  const cuentas = firebaseConfigurado() && Datos.modo !== "local";
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
          <span class="meta">${fechaHora(r.creado)} · ${r.confirmaciones || 0} confirman, ${r.negaciones || 0} dicen que ya no está${cuentas ? ` · por ${esc(perfilDe(r.autor)?.usuario || "cuenta sin perfil")} ${htmlMedalla(medallaDe(verificadosDe(r.autor)), "medalla-mini")}` : ""}</span>
          <span class="item-badges"><span class="estado-badge g-${g}">${NOMBRE_GESTION[g]}</span>${comunidad}${r.verificadoAutoridad ? '<span class="estado-badge autoridad">Verificado</span>' : ""}${r.ambito === "unt" ? '<span class="etiqueta-campus">Campus UNT</span>' : ""}${cuentas && S.bloqueados[r.autor] ? '<span class="estado-badge bloqueado">Autor bloqueado</span>' : ""}</span>
        </div>
      </div>
      <div class="ctl-acciones">
        ${accionG}
        <button data-acc="mapa" data-id="${esc(id)}">${ic("map-pin")}Ver en mapa</button>
        <button data-acc="verificar" data-id="${esc(id)}">${ic("badge-check")}${r.verificadoAutoridad ? "Quitar verificación" : "Verificar"}</button>
        ${cuentas && r.autor && r.autor !== Datos.uid ? `<button data-acc="bloquear" data-id="${esc(id)}">${ic("ban")}${S.bloqueados[r.autor] ? "Desbloquear autor" : "Bloquear autor"}</button>` : ""}
        <button data-acc="borrar" data-id="${esc(id)}" aria-label="Eliminar reporte">${ic("trash-2")}</button>
        ${votosSim ? `<button data-acc="si" data-id="${esc(id)}">+1 confirmar (demo)</button><button data-acc="no" data-id="${esc(id)}">+1 ya no está (demo)</button>` : ""}
      </div></li>`;
  }).join("") : `<li class="lista-vacia">No hay reportes ${filtroGestion === "todos" ? "" : `"${NOMBRE_GESTION[filtroGestion].toLowerCase()}"`}.</li>`;
  cargarMiniaturas(cont, 12);
}

function prepararAdmin() {
  if (!firebaseConfigurado()) {
    // Solo en modo local (sin Firebase): acceso oculto con 5 toques en el logo (en menos de 3 s) o ?admin=1
    let toques = [];
    $("#logo").addEventListener("click", () => {
      const t = Date.now();
      toques = toques.filter((x) => t - x < 3000).concat(t);
      if (toques.length >= 5) { toques = []; abrirAdmin(); }
    });
    if (new URLSearchParams(location.search).get("admin") === "1") abrirAdmin();
  } else localStorage.removeItem("previunt_autoridad"); // el modo autoridad viejo ya no vale: ahora es por cuenta
  aplicarModoAutoridad();

  $("#btnSalirAutoridad").onclick = async () => {
    if (firebaseConfigurado()) {
      if (!confirm("¿Cerrar sesión de tu cuenta de autoridad en este celular?")) return;
      await Cuenta.salir(); irATab("inicio"); toast("Sesión cerrada."); return;
    }
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
    // Un estado oficial nunca se deja "en cola": o lo confirma el servidor ahora, o no se publica
    if (sinServidor(simular ? "la simulación no se activó" : "el estado oficial no se publicó")) return;
    if (!simular && n === 3 && !confirm("Esto activa la alarma y la sirena física para toda la población. ¿Confirmas el desborde?")) return;
    try {
      Sirena.desbloquear();
      if (simular) {
        await Datos.setDemo(true, n, fuente || "Simulación");
        await Datos.addHistorial(`d_${ahora()}`, { nivel: n, estado: NIVELES[n].estado, fecha: ahora(), origen: "demo", fuente: fuente || "Simulación" });
        toast(`Simulando: ${NIVELES[n].corto}`);
      } else {
        if (S.demo?.activo) await Datos.setDemo(false, 0);
        await conTiempo(Datos.publicarEstado(n, fuente), 15000);
        await Datos.addHistorial(`a_${ahora()}`, { nivel: n, estado: NIVELES[n].estado, fecha: ahora(), origen: "autoridad", fuente });
        toast(`Publicado: ${NIVELES[n].corto}`);
      }
    } catch (e) { console.error(e); toast("No se pudo cambiar el estado: " + e.message); }
  }));
  $("#btnRenovarAlerta").onclick = () => renovarAlerta(true);
  $("#btnPruebaFisica").onclick = async () => {
    if (sinServidor("no se envió la prueba")) return;
    try { await Datos.alertaPrueba(true); toast(`Prueba enviada a la zona ${ZONA_PRUEBA}: suena unos 2 minutos.`); }
    catch (e) { toast("No se pudo: " + e.message); }
  };
  $("#btnPruebaFisicaOff").onclick = async () => {
    if (sinServidor("no se apagó la prueba")) return;
    try { await Datos.alertaPrueba(false); toast("Prueba apagada (el ESP32 se apaga en dos lecturas)."); }
    catch (e) { toast("No se pudo: " + e.message); }
  };
  // Mientras siga el desborde, la app de la autoridad renueva la vigencia antes de que venza
  setInterval(() => renovarAlerta(false), 60 * 1000);
  $("#btnDemoOff").onclick = async () => {
    if (sinServidor("la simulación sigue activa")) return;
    try { await Datos.setDemo(false, 0); toast("Simulación terminada: se muestra el estado oficial."); }
    catch (e) { toast("Error: " + e.message); }
  };
  $("#chkProximidad").onchange = async (e) => {
    if (sinServidor("no se cambió la cercanía")) { e.target.checked = !e.target.checked; return; }
    try {
      await Datos.setProximidad(e.target.checked);
      toast(e.target.checked ? `Cercanía activada: reportar a ≤ ${RADIO_REPORTE_M} m y validar a ≤ ${RADIO_VOTO_M / 1000} km.` : "Cercanía desactivada: se puede reportar y validar desde cualquier lugar.");
    } catch (err) { toast("Error: " + err.message); }
  };
  $("#btnProbarSirena").onclick = () => Sirena.prueba(4300);
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
      if (sinServidor("el cambio no se guardó")) return;
      if (b.dataset.acc === "atencion") { await Datos.actualizarReporte(id, { gestion: "en_atencion", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte en atención"); }
      if (b.dataset.acc === "atendido") { await Datos.actualizarReporte(id, { gestion: "atendido", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte atendido: deja de mostrarse a los vecinos"); }
      if (b.dataset.acc === "reabrir") { await Datos.actualizarReporte(id, { gestion: "pendiente", gestionEn: ahora(), gestionPor: Datos.uid }); toast("Reporte reabierto"); }
      if (b.dataset.acc === "verificar") await Datos.actualizarReporte(id, { verificadoAutoridad: !r.verificadoAutoridad, verificadoEn: ahora() });
      if (b.dataset.acc === "si") await Datos.votar(id, 1, "sim_" + idAleatorio().slice(0, 8));
      if (b.dataset.acc === "no") await Datos.votar(id, -1, "sim_" + idAleatorio().slice(0, 8));
      if (b.dataset.acc === "borrar" && confirm("¿Eliminar este reporte? No se puede deshacer.")) await Datos.borrarReporte(id);
      if (b.dataset.acc === "bloquear") {
        const bloq = !!S.bloqueados[r.autor], quien = perfilDe(r.autor)?.usuario || "este autor";
        if (confirm(bloq ? `¿Desbloquear a ${quien}? Podrá volver a reportar y votar.` : `¿Bloquear a ${quien}? No podrá reportar ni votar. Sus reportes siguen visibles hasta que los elimines.`)) {
          await Datos.bloquear(r.autor, !bloq); toast(bloq ? "Autor desbloqueado" : "Autor bloqueado");
        }
      }
    } catch (err) { console.error(err); toast("Error: " + err.message); }
  });
}

/* ---------------------------------------------------------------------
   CUENTAS: interfaz (botón de cuenta, hojas de entrada y registro, puertas)
   Solo en modo Firebase. En modo local (sin Firebase) la app funciona como antes, sin cuentas.
--------------------------------------------------------------------- */
/* Avatares ilustrados (archivos en ./avatares/<id>.svg). Los ids viejos de color ("ola-azul", "monte-cafe"…)
   y "escudo" de los admins ya no existen: se muestran con un avatar por defecto, sin tocar la base. */
const AVATARES = [
  { id: "aranita_blanquirroja", nombre: "Arañita Blanquirroja" },
  { id: "capitan_cuy",          nombre: "Capitán Cuy" },
  { id: "don_clava",            nombre: "Don Clava" },
  { id: "huaquito",             nombre: "Huaquito" },
  { id: "llama_chevere",        nombre: "Llama Chévere" },
  { id: "sargento_ronsoco",     nombre: "Sargento Ronsoco" },
  { id: "gallito_avisador",     nombre: "Gallito Avisador" },
  { id: "ukumari_rescatista",   nombre: "Ukumari Rescatista" },
  { id: "calato_preparado",     nombre: "Calato Preparado" }
];
const AVATAR_DEFECTO = "capitan_cuy";
const AVATAR_ADMIN = "don_clava";   // para el antiguo "escudo" de los admins
const avatarValido = (id) => AVATARES.some((a) => a.id === id);
const avatarDe = (id) => avatarValido(id) ? id : id === "escudo" ? AVATAR_ADMIN : AVATAR_DEFECTO;
const nombreAvatar = (id) => (AVATARES.find((a) => a.id === avatarDe(id)) || {}).nombre || "Avatar";
const conCuentas = () => firebaseConfigurado() && Datos.modo !== "local";
const perfilDe = (uid) => (S.perfiles && S.perfiles[uid]) || null;

function htmlAvatar(perfil, clase = "avatar-chico", id = "") {
  const av = avatarDe(perfil && perfil.avatar);
  return `<img${id ? ` id="${id}"` : ""} class="avatar ${clase}" src="./avatares/${av}.svg" alt="${esc(nombreAvatar(av))}" decoding="async">`;
}

/* ---------- Medallas: cuántos reportes verificados tiene cada cuenta ---------- */
const verificadosDe = (uid) => {
  if (Datos.modo === "local") return Object.values(S.reportes || {}).filter((r) => r && r.autor === uid && reporteVerificado(r)).length;
  return Object.keys((S.verificados && S.verificados[uid]) || {}).length;
};
function htmlMedalla(m, clase = "") {
  if (!m) return "";
  return `<span class="medalla m-${m.metal} ${clase}" role="img" aria-label="Medalla ${esc(m.nombre)}, nivel ${m.nivel} de 5"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-medalla"/></svg></span>`;
}
function htmlNivel(uid, conIcono = true) {
  const m = medallaDe(verificadosDe(uid));
  return m ? `<span class="nivel-rep">${conIcono ? htmlMedalla(m) : ""}${esc(m.nombre)}</span>` : `<span class="nivel-rep">Nuevo</span>`;
}
/* Avatar con la medalla (si tiene) como insignia en la esquina inferior derecha */
function htmlAvatarMedalla(perfil, uid, clase = "avatar-chico", id = "") {
  const m = uid ? medallaDe(verificadosDe(uid)) : null;
  return `<span${id ? ` id="${id}"` : ""} class="avatar-caja ${clase}-caja">${htmlAvatar(perfil, clase)}${m ? htmlMedalla(m, "medalla-avatar") : ""}</span>`;
}
/* Registra en /verificados los reportes que ya están verificados (lo hace cualquier cuenta con sesión;
   las reglas comprueban la prueba). Así el conteo de medallas no se pierde cuando el reporte sale de las 72 h. */
const _pruebasIntentadas = new Set();
function registrarVerificados() {
  if (Datos.modo !== "firebase" || !Red.conectado || !S._verificadosCargados || !Datos.fb) return;
  const u = Cuenta.usuario;
  if (!u || u.tipo === "invitado") return;
  let n = 0;
  for (const [id, r] of Object.entries(S.reportes || {})) {
    if (n >= 5) break;
    if (!r || !r.autor || String(r.autor).startsWith("sim_") || _pruebasIntentadas.has(id)) continue;
    if (S.verificados[r.autor] && S.verificados[r.autor][id]) continue;
    const prueba = pruebaVerificado(r, S.votos && S.votos[id], S.perfiles);
    if (!prueba) continue;
    _pruebasIntentadas.add(id); n++;
    Datos.fb.set(Datos.fb.ref(Datos.db, `verificados/${r.autor}/${id}`), { ...prueba, t: Datos.fb.serverTimestamp() })
      .catch((e) => console.info("Reporte verificado ya registrado o rechazado:", id, e && e.code));
  }
}
/* Aviso cuando la propia cuenta sube de medalla (una vez por nivel y por celular) */
function revisarSubidaMedalla() {
  const u = Cuenta.usuario;
  if (!u || u.tipo === "invitado" || (Datos.modo !== "local" && !S._verificadosCargados)) return;
  const n = verificadosDe(u.uid), m = medallaDe(n), nivel = m ? m.nivel : 0, clave = "previunt_medalla_" + u.uid;
  const antes = lsGet(clave, null);
  if (antes !== null && nivel > antes) toast(`¡Nueva medalla: ${m.nombre}! Ya tienes ${n} reportes verificados.`, 6000);
  if (antes !== nivel) lsSet(clave, nivel);
}
function htmlAutor(r) {
  if (!r || !r.autor || String(r.autor).startsWith("sim_")) return "";
  const p = perfilDe(r.autor);
  if (!p) return "";
  return `<p class="popup-autor">${htmlAvatarMedalla(p, r.autor)}<span>Reportado por <strong>${esc(p.usuario)}</strong> · ${htmlNivel(r.autor, false)}</span></p>`;
}

/* ---------- Estado de la cuenta para la interfaz ---------- */
function falta() { // qué le falta a la cuenta actual (null si nada)
  const u = Cuenta.usuario;
  if (!u || u.tipo === "invitado" || u.esAdmin) return null;
  if (!Cuenta.registroCompleto()) return "registro";
  if (u.tipo === "personal" && !u.celularVerificado) return "registro";
  if (u.tipo === "unt" && !u.correoVerificado) return "correo";
  return null;
}
function renderBotonCuenta() {
  const b = $("#btnCuenta"); if (!b) return;
  b.hidden = !firebaseConfigurado();
  if (b.hidden) return;
  const u = Cuenta.usuario, invitado = !u || u.tipo === "invitado";
  b.classList.toggle("invitado", invitado);
  $("#cuentaPunto").hidden = invitado || !falta();
  if (invitado) {
    $("#cuentaAvatar").outerHTML = `<span id="cuentaAvatar" class="avatar avatar-chico">${ic("log-in")}</span>`;
    $("#cuentaTexto").textContent = "Entrar";
    b.setAttribute("aria-label", "Iniciar sesión o crear cuenta");
    return;
  }
  const p = perfilDe(u.uid) || (u.nombreUsuario ? { usuario: u.nombreUsuario } : null);
  $("#cuentaAvatar").outerHTML = htmlAvatarMedalla(p, u.uid, "avatar-chico", "cuentaAvatar");
  $("#cuentaTexto").textContent = p ? p.usuario : "Completa tu registro";
  const med = medallaDe(verificadosDe(u.uid));
  b.setAttribute("aria-label", p ? `Tu cuenta: ${p.usuario}${med ? `, medalla ${med.nombre}` : ""}` : "Completa tu registro");
  b.title = p ? `${p.usuario}${med ? ` · ${med.nombre}` : ""}` : "Completa tu registro";
  revisarSubidaMedalla();
}

/* Puerta: true si puede participar en ese ámbito; si no, abre la hoja que corresponde */
function puertaCuenta(ambito, despues) {
  if (!conCuentas() && Datos.modo === "local") return true;
  const motivo = Cuenta.motivoNoPuede(ambito);
  if (!motivo) return true;
  const u = Cuenta.usuario;
  if (!u || u.tipo === "invitado") abrirCuenta("login", { motivo, despues });
  else if (falta() === "registro") abrirPendiente(motivo, despues);
  else if (falta() === "correo") abrirCuenta("correo", { despues });
  else toast(motivo, 5000);
  return false;
}
function abrirPendiente(motivo, despues) {
  const u = Cuenta.usuario; if (!u) return;
  if (falta() === "correo") { abrirCuenta("correo", { despues }); return; }
  HC.tipoReg = u.tipo === "unt" ? "unt" : "personal";
  abrirCuenta("registro", { completar: true, motivo: motivo || "Te falta completar tu registro para reportar y votar.", despues });
}

/* ---------- Hoja de cuenta ---------- */
const HC = { pantalla: null, loginTipo: "personal", tipoReg: "personal", completar: false, avatar: AVATAR_DEFECTO, olvTipo: "personal", olvPaso: 1, smsTel: "", reloj: null, despues: null };
const TITULOS_CUENTA = { login: "Inicia sesión", registro: "Crear cuenta", sms: "Código SMS", correo: "Revisa tu correo UNT", olvido: "Olvidé mi contraseña", micuenta: "Mi cuenta" };

function abrirCuenta(pantalla, o = {}) {
  HC.pantalla = pantalla;
  ocultarClaves();
  if ("despues" in o) HC.despues = o.despues || null;
  if (pantalla === "registro") HC.completar = !!o.completar;
  $("#hojaCuenta").hidden = false;
  $$("#hojaCuenta [data-pantalla]").forEach((el) => (el.hidden = el.dataset.pantalla !== pantalla));
  $("#cuentaTitulo").textContent = pantalla === "registro" && HC.completar ? "Completa tu registro" : TITULOS_CUENTA[pantalla];
  $("#cuentaMotivo").hidden = !o.motivo;
  $("#cuentaMotivo").textContent = o.motivo || "";
  $$("#hojaCuenta .error-form, #hojaCuenta .ok-form").forEach((p) => (p.textContent = ""));
  if (pantalla === "login") elegirLogin(HC.loginTipo);
  if (pantalla === "registro") prepararRegistro();
  if (pantalla === "sms") prepararSMS();
  if (pantalla === "correo") $("#correoTexto").innerHTML = `Abre el enlace que enviamos a <strong>${esc(Cuenta.usuario?.correo || "tu correo UNT")}</strong>. Hasta abrirlo no puedes reportar en el campus.`;
  if (pantalla === "olvido") elegirOlvido(HC.olvTipo);
  if (pantalla === "micuenta") renderMiCuenta();
  $("#hojaCuenta .hoja").scrollTop = 0;
  const primero = $(`#hojaCuenta [data-pantalla="${pantalla}"] input:not([type=checkbox])`);
  if (primero && pantalla !== "micuenta") setTimeout(() => primero.focus({ preventScroll: true }), 60);
}
function cerrarCuenta() { $("#hojaCuenta").hidden = true; HC.pantalla = null; clearInterval(HC.reloj); ocultarClaves(); }
/* Ojito para ver u ocultar lo que se escribe en los campos de contraseña */
function prepararOjosClave() {
  $$("#hojaCuenta input[type=password]").forEach((inp) => {
    const caja = document.createElement("div");
    caja.className = "input-clave";
    inp.parentNode.insertBefore(caja, inp);
    caja.appendChild(inp);
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn-ojo";
    caja.appendChild(b);
    const pintar = () => {
      const visible = inp.type === "text";
      b.innerHTML = ic(visible ? "eye-off" : "eye");
      b.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
      b.setAttribute("aria-pressed", String(visible));
    };
    b.addEventListener("click", () => {
      inp.type = inp.type === "password" ? "text" : "password";
      pintar();
      inp.focus({ preventScroll: true });
    });
    b._pintar = pintar; pintar();
  });
}
function ocultarClaves() { // al cerrar la hoja o al entrar, las contraseñas vuelven a ocultarse
  $$("#hojaCuenta .input-clave").forEach((c) => { c.querySelector("input").type = "password"; c.querySelector(".btn-ojo")._pintar(); });
}
function terminarCuenta(msg) {
  const despues = HC.despues; HC.despues = null;
  cerrarCuenta();
  if (msg) toast(msg, 4000);
  renderBotonCuenta();
  if (despues && !falta()) setTimeout(despues, 200);
}
/* Espera a que Cuenta termine de leer la sesión nueva (evento "sesion") */
function esperarSesion(ms = 6000) {
  return new Promise((ok) => {
    const uid = Datos.auth?.currentUser?.uid;
    if (Cuenta.usuario && Cuenta.usuario.uid === uid) { ok(Cuenta.usuario); return; }
    const f = (e) => { if (!uid || e.detail.uid === uid) { document.removeEventListener("sesion", f); clearTimeout(t); ok(e.detail); } };
    const t = setTimeout(() => { document.removeEventListener("sesion", f); ok(Cuenta.usuario); }, ms);
    document.addEventListener("sesion", f);
  });
}
async function conBoton(btn, texto, fn) {
  const antes = btn.innerHTML; btn.disabled = true; btn.textContent = texto;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = antes; }
}

/* Después de entrar: completar lo que falte o cerrar */
async function despuesDeEntrar() {
  const u = await esperarSesion();
  if (!u || u.tipo === "invitado") return;
  if (u.tipo === "otro") { toast("Esta cuenta no es de PREVIUNT."); await Cuenta.salir(); return; }
  const f = falta();
  if (f === "registro") { abrirPendiente(); return; }
  if (f === "correo") { abrirCuenta("correo"); return; }
  const p = perfilDe(u.uid);
  terminarCuenta(`Hola, ${p?.usuario || u.nombreUsuario || "bienvenido"}.`);
}

function pintarAvatares(cont, elegido, alElegir) {
  const sel = avatarDe(elegido);
  cont.innerHTML = AVATARES.map((a) =>
    `<button type="button" role="radio" aria-checked="${a.id === sel}" data-avatar="${a.id}">
      <img src="./avatares/${a.id}.svg" alt="" width="64" height="64" loading="lazy" decoding="async"><span>${esc(a.nombre)}</span></button>`).join("");
  cont.onclick = (e) => { const b = e.target.closest("[data-avatar]"); if (b) alElegir(b.dataset.avatar); };
}

function prepararRegistro() {
  const t = HC.tipoReg, comp = HC.completar, u = Cuenta.usuario;
  $$("[data-tipo-cuenta]").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.tipoCuenta === t)); b.disabled = comp; });
  $("#regExplica").textContent = comp
    ? (t === "unt" ? "Tu cuenta UNT ya existe. Completa tus datos para usarla." : "Tu cuenta ya existe. Completa tus datos y verifica tu celular con el código SMS.")
    : t === "unt"
      ? "Con tu correo @unitru.edu.pe. Sirve para reportar y validar dentro del campus. Te enviaremos un enlace a ese correo."
      : "Para reportar y validar en la ciudad. Verificamos tu celular con un código por SMS.";
  // Al completar: la personal ya tiene usuario (es su login); la UNT elige uno ahora
  $("#grupoUsuario").hidden = comp && t === "personal";
  $("#grupoClaves").hidden = comp;
  $("#regCorreo").placeholder = t === "unt" ? "tu@unitru.edu.pe" : "tu@gmail.com";
  // Usuario: en la cuenta UNT se escribe la base y la app agrega "_unt"
  const antes = $("#regUsuario").value;
  $("#regSufijo").hidden = t !== "unt";
  $("#regUsuario").maxLength = t === "unt" ? 16 : 20;
  $("#regUsuario").value = t === "unt" ? antes.replace(/_unt$/, "").slice(0, 16) : antes;
  $("#regUsuarioEstado").textContent = "";
  $("#regUsuarioAyuda").textContent = t === "unt"
    ? "Se agrega _unt al final, así puedes usar el mismo nombre que en tu cuenta personal. Es lo único que verán los demás."
    : "Es lo único que verán los demás. Minúsculas, números o _. No se puede cambiar después.";
  if (comp && t === "unt" && u?.correo) { $("#regCorreo").value = u.correo; $("#regCorreo").readOnly = true; } else $("#regCorreo").readOnly = false;
  $("#btnCrearCuenta").textContent = comp ? (t === "personal" && !u?.celularVerificado ? "Enviar código SMS" : "Guardar mis datos") : t === "personal" ? "Crear cuenta y enviar código" : "Crear cuenta UNT";
  $("#regConsentimiento").hidden = !PEDIR_CONSENTIMIENTO;
  $("#regConsentimientoTexto").textContent = `Acepto que PREVIUNT trate mis datos (nombres, apellidos, DNI, celular y correo) solo para crear mi cuenta, verificar que soy una persona real y responder ante reportes falsos. Mis datos no se muestran a otros usuarios: en la app solo aparece mi nombre de usuario. Puedo pedir que borren mi cuenta y mis datos escribiendo a ${CORREO_DATOS}.`;
  pintarAvataresRegistro();
  mostrarErrores({});
}
function pintarAvataresRegistro() {
  const elegir = (av) => { HC.avatar = av; pintarAvatares($("#regAvatares"), av, elegir); };
  pintarAvatares($("#regAvatares"), HC.avatar, elegir);
}
function leerRegistro() {
  return {
    nombres: $("#regNombres").value, apellidos: $("#regApellidos").value, usuario: $("#regUsuario").value,
    celular: $("#regCelular").value.replace(/\D/g, ""), correo: $("#regCorreo").value, dni: $("#regDni").value.replace(/\D/g, ""),
    clave: $("#regClave").value, clave2: $("#regClave2").value, acepto: $("#regAcepto").checked, avatar: HC.avatar
  };
}
function mostrarErrores(e) {
  $$("#formRegistro [data-error]").forEach((p) => (p.textContent = e[p.dataset.error] || ""));
  const ids = { nombres: "regNombres", apellidos: "regApellidos", usuario: "regUsuario", celular: "regCelular", correo: "regCorreo", dni: "regDni", clave: "regClave", clave2: "regClave2" };
  Object.entries(ids).forEach(([k, id]) => $("#" + id).setAttribute("aria-invalid", String(!!e[k])));
  const primero = Object.keys(ids).find((k) => e[k]);
  if (primero) $("#" + ids[primero]).focus();
}

function prepararSMS() {
  const n = String(HC.smsTel || "");
  $("#smsTexto").innerHTML = `Te enviamos un código al <strong>+51 ${n.slice(0, 1)}•• ••• •${esc(n.slice(-2))}</strong>.`;
  $("#smsCodigo").value = "";
  clearInterval(HC.reloj);
  let s = 60; const b = $("#btnReenviarSMS");
  b.disabled = true; b.textContent = `Reenviar (${s} s)`;
  HC.reloj = setInterval(() => { s--; if (s <= 0) { clearInterval(HC.reloj); b.disabled = false; b.textContent = "Reenviar"; } else b.textContent = `Reenviar (${s} s)`; }, 1000);
}

/* Iniciar sesión: pestaña personal (usuario) o UNT (correo @unitru.edu.pe) */
function elegirLogin(t) {
  const cambio = HC.loginTipo !== t;
  HC.loginTipo = t;
  $$("[data-login]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.login === t)));
  const inp = $("#loginUsuario");
  $("#loginEtiqueta").textContent = t === "unt" ? "Correo UNT" : "Usuario";
  inp.type = t === "unt" ? "email" : "text";
  inp.inputMode = t === "unt" ? "email" : "text";
  inp.autocomplete = t === "unt" ? "email" : "username";
  inp.placeholder = t === "unt" ? "tu@unitru.edu.pe" : "ej.: ana_m";
  if (cambio) { inp.value = ""; $("#loginError").textContent = ""; }
}
function elegirOlvido(t) {
  HC.olvTipo = t;
  $$("[data-olvido]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.olvido === t)));
  $("#olvPersonal").hidden = t !== "personal";
  $("#olvUNT").hidden = t !== "unt";
  if (t === "personal" && HC.olvPaso === 1) $("#olvPaso2").hidden = true;
  $("#btnOlvidoEnviar").textContent = t === "unt" ? "Enviar enlace" : HC.olvPaso === 2 ? "Cambiar contraseña" : "Enviar código";
}

async function renderMiCuenta() {
  const u = Cuenta.usuario; if (!u) return;
  const p = perfilDe(u.uid) || { usuario: u.nombreUsuario || "?", avatar: AVATAR_DEFECTO };
  $("#mcAvatar").outerHTML = htmlAvatarMedalla(p, u.uid, "avatar-grande", "mcAvatar");
  $("#mcUsuario").textContent = p.usuario;
  const nv = verificadosDe(u.uid), med = medallaDe(nv), sig = siguienteMedalla(nv);
  $("#mcNivel").innerHTML = htmlNivel(u.uid, false);
  const desde = med ? med.min : 0, pct = sig ? Math.round(((nv - desde) / (sig.min - desde)) * 100) : 100;
  $("#mcMedallas").innerHTML = `
    <p class="mc-verificados"><strong>${nv}</strong> ${nv === 1 ? "reporte verificado" : "reportes verificados"}</p>
    <div class="barra-medalla" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    <p class="meta">${sig ? `Te ${sig.min - nv === 1 ? "falta 1 reporte verificado" : `faltan ${sig.min - nv} reportes verificados`} para <strong>${esc(sig.nombre)}</strong>.` : "¡Llegaste a la medalla más alta!"}</p>
    <ol class="fila-medallas">${MEDALLAS.map((m) => `<li class="${nv >= m.min ? "lograda" : "bloqueada"}">${htmlMedalla(m, "medalla-grande")}<span>${esc(m.nombre)}</span><small>${m.min}</small></li>`).join("")}</ol>
    <p class="meta">Un reporte se verifica cuando 3 personas lo confirman o cuando la autoridad lo verifica.</p>`;
  $("#mcTipo").textContent = u.esAdmin ? "Cuenta de autoridad (admin)" : u.tipo === "unt" ? `Cuenta UNT · ${u.correo}` : "Cuenta personal";
  const f = falta(), bloq = S.bloqueados && S.bloqueados[u.uid];
  $("#mcAviso").hidden = !(f || bloq);
  $("#mcAviso").textContent = bloq ? "Tu cuenta fue bloqueada por la autoridad: no puedes reportar ni votar." : f === "correo" ? "Falta abrir el enlace de tu correo UNT." : f ? "Falta completar tu registro." : "";
  pintarAvatares($("#mcAvatares"), p.avatar, async (a) => {
    if (!perfilDe(u.uid)) { toast("Completa tu registro para elegir avatar."); return; }
    try { await Cuenta.cambiarAvatar(a); S.perfiles[u.uid] = { ...S.perfiles[u.uid], avatar: a }; renderMiCuenta(); renderBotonCuenta(); }
    catch (e) { toast("No se pudo cambiar el avatar."); }
  });
  $("#mcDetalles").open = false;
  $("#mcDatos").innerHTML = "<dt>Cargando…</dt>";
  $("#mcBorrar").textContent = PEDIR_CONSENTIMIENTO ? `Para borrar tu cuenta y tus datos, escribe a ${CORREO_DATOS}.` : "";
}
async function cargarMisDatos() {
  try {
    const d = await Cuenta.misDatos();
    $("#mcDatos").innerHTML = d
      ? [["Nombres", d.nombres], ["Apellidos", d.apellidos], ["DNI", d.dni], ["Celular", d.celular], ["Correo", d.correo], ["Registro", fechaHora(d.creado)]]
        .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")
      : `<dt>${Cuenta.usuario?.esAdmin ? "Cuenta de autoridad: no guarda datos personales en la app." : "Aún no hay datos guardados."}</dt>`;
  } catch (e) { $("#mcDatos").innerHTML = "<dt>No se pudieron leer (¿sin conexión?).</dt>"; }
}

function prepararCuentas() {
  if (!firebaseConfigurado()) return;
  Cuenta.cargarGuardada();
  prepararOjosClave();
  renderBotonCuenta();
  $("#btnCuenta").onclick = () => {
    const u = Cuenta.usuario;
    if (!u || u.tipo === "invitado") abrirCuenta("login", { despues: null });
    else if (falta()) abrirPendiente(null, null);
    else abrirCuenta("micuenta");
  };
  $("#btnCerrarCuenta").onclick = cerrarCuenta;
  $("#hojaCuenta").addEventListener("click", (e) => {
    if (e.target.id === "hojaCuenta" || e.target.closest("[data-cerrar-cuenta]")) { cerrarCuenta(); return; }
    const ir = e.target.closest("[data-pantalla-ir]");
    if (ir) {
      // la pestaña elegida (personal / UNT) se mantiene al pasar entre entrar, crear cuenta y contraseña olvidada
      const desde = HC.pantalla, t = desde === "login" ? HC.loginTipo : desde === "registro" ? HC.tipoReg : desde === "olvido" ? HC.olvTipo : null;
      if (t) { HC.loginTipo = t; HC.tipoReg = t; HC.olvTipo = t; }
      if (ir.dataset.pantallaIr === "registro") HC.completar = false;
      HC.olvPaso = 1; abrirCuenta(ir.dataset.pantallaIr);
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#hojaCuenta").hidden) cerrarCuenta(); });

  // Entrar
  $$("[data-login]").forEach((b) => b.addEventListener("click", () => elegirLogin(b.dataset.login)));
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = $("#loginUsuario").value.trim(), clave = $("#loginClave").value, unt = HC.loginTipo === "unt";
    const err = (m) => { $("#loginError").textContent = m; };
    if (!usuario || !clave) { err(unt ? "Escribe tu correo UNT y tu contraseña." : "Escribe tu usuario y tu contraseña."); return; }
    if (unt && !RE_UNT.test(usuario)) { err("Escribe tu correo completo @unitru.edu.pe."); return; }
    if (!unt && RE_UNT.test(usuario)) { err("Ese es un correo UNT: entra por la pestaña «Cuenta UNT»."); return; }
    if (!unt && usuario.includes("@")) { err("Escribe tu nombre de usuario (por ejemplo ana_m), no tu correo."); return; }
    if (!unt && normalizarUsuario(usuario).endsWith(SUFIJO_UNT)) { err("Las cuentas UNT entran por la pestaña «Cuenta UNT», con su correo."); return; }
    $("#loginError").textContent = "";
    try {
      await conBoton($("#btnEntrar"), "Entrando…", () => Cuenta.entrar(usuario, clave));
      $("#loginClave").value = "";
      await despuesDeEntrar();
    } catch (err) { $("#loginError").textContent = err.message; }
  });

  // Crear cuenta
  $$("[data-tipo-cuenta]").forEach((b) => b.addEventListener("click", () => { HC.tipoReg = b.dataset.tipoCuenta; prepararRegistro(); }));
  $("#regUsuario").addEventListener("input", (e) => { e.target.value = e.target.value.toLowerCase().replace(/\s/g, ""); $("#regUsuarioEstado").textContent = ""; });
  $("#regUsuario").addEventListener("blur", async () => {
    const t = HC.tipoReg, u = usuarioFinal($("#regUsuario").value, t), est = $("#regUsuarioEstado");
    est.className = "meta estado-usuario"; est.textContent = "";
    if (errorUsuario($("#regUsuario").value, t)) return;
    try {
      const libre = await conTiempo(Cuenta.usuarioLibre(u), 8000);
      est.textContent = libre ? (t === "unt" ? `Disponible: tu usuario será ${u}` : "Disponible") : "Ya está en uso"; est.classList.add(libre ? "libre" : "ocupado");
    } catch {}
    pintarAvataresRegistro();
  });
  ["regCelular", "regDni", "olvCelular", "smsCodigo", "olvCodigo"].forEach((id) =>
    $("#" + id).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); }));
  $("#formRegistro").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sinServidor("no se pudo crear la cuenta")) return;
    const t = HC.tipoReg, comp = HC.completar, d = leerRegistro();
    if (comp && t === "personal") d.usuario = String(Datos.auth.currentUser?.email || "").split("@")[0];
    const errs = validarRegistro(d, t, comp && t === "personal");
    if (comp && t === "unt" && errorUsuario(d.usuario, "unt")) errs.usuario = errorUsuario(d.usuario, "unt");
    mostrarErrores(errs);
    $("#regError").textContent = "";
    if (Object.keys(errs).length) return;
    const btn = $("#btnCrearCuenta");
    try {
      if (t === "personal" && !comp) {
        await conBoton(btn, "Enviando código…", () => Cuenta.registrarPersonal(d));
        HC.smsTel = d.celular; abrirCuenta("sms");
      } else if (t === "personal") {
        const faltaCodigo = await conBoton(btn, "Enviando…", () => Cuenta.completarRegistroPersonal(d));
        if (faltaCodigo) { HC.smsTel = d.celular; abrirCuenta("sms"); } else terminarCuenta("¡Listo! Tu registro está completo.");
      } else if (!comp) {
        await conBoton(btn, "Creando cuenta…", () => Cuenta.registrarUNT(d));
        abrirCuenta("correo");
      } else {
        await conBoton(btn, "Guardando…", () => Cuenta.completarRegistroUNT(d));
        if (Cuenta.usuario?.correoVerificado) terminarCuenta("¡Listo! Tu registro está completo."); else abrirCuenta("correo");
      }
      $("#regClave").value = $("#regClave2").value = "";
    } catch (err) { $("#regError").textContent = err.message; }
  });

  // Código SMS
  $("#formSMS").addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = $("#smsCodigo").value.trim();
    if (!/^\d{6}$/.test(c)) { $("#smsError").textContent = "Escribe el código de 6 dígitos."; return; }
    $("#smsError").textContent = "";
    try {
      await conBoton($("#btnConfirmarSMS"), "Verificando…", () => Cuenta.confirmarRegistroPersonal(c));
      clearInterval(HC.reloj);
      terminarCuenta("¡Listo! Tu celular está verificado. Ya puedes reportar y validar en la ciudad.");
    } catch (err) {
      if (/código/i.test(err.message)) { $("#smsError").textContent = err.message; return; }
      // Celular o DNI ya usados: la cuenta a medio crear se borró. Vuelve al formulario con el motivo.
      HC.completar = false; abrirCuenta("registro"); $("#regError").textContent = err.message;
    }
  });
  $("#btnReenviarSMS").onclick = async () => {
    try { await Cuenta.enviarSMS(celularE164(HC.smsTel)); toast("Te enviamos un código nuevo."); prepararSMS(); }
    catch (err) { $("#smsError").textContent = mensajeError(err); }
  };
  $("#btnCancelarRegistro").onclick = async () => {
    if (!confirm("¿Cancelar el registro? Se borrará la cuenta que empezaste a crear.")) return;
    clearInterval(HC.reloj);
    await Cuenta.cancelarRegistro();
    cerrarCuenta(); toast("Registro cancelado.");
  };

  // Correo UNT
  $("#btnYaVerifique").onclick = async () => {
    $("#correoError").textContent = "";
    try {
      const ok = await conBoton($("#btnYaVerifique"), "Comprobando…", () => Cuenta.yaVerifique());
      if (ok) terminarCuenta("¡Listo! Tu cuenta UNT está verificada. Ya puedes reportar dentro del campus.");
      else $("#correoError").textContent = "Todavía no aparece verificado. Abre el enlace del correo y vuelve a tocar «Ya verifiqué».";
    } catch (err) { $("#correoError").textContent = mensajeError(err); }
  };
  $("#btnReenviarCorreo").onclick = async () => {
    try { await Cuenta.reenviarCorreoUNT(); toast("Te enviamos el correo otra vez."); }
    catch (err) { $("#correoError").textContent = mensajeError(err); }
  };

  // Olvidé mi contraseña
  $$("[data-olvido]").forEach((b) => b.addEventListener("click", () => { HC.olvPaso = 1; elegirOlvido(b.dataset.olvido); }));
  $("#formOlvido").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#olvError").textContent = ""; $("#olvOk").textContent = "";
    const btn = $("#btnOlvidoEnviar");
    try {
      if (HC.olvTipo === "unt") {
        const c = $("#olvCorreo").value.trim();
        if (!RE_UNT.test(c)) { $("#olvError").textContent = "Usa tu correo @unitru.edu.pe."; return; }
        await conBoton(btn, "Enviando…", () => Cuenta.recuperarUNT(c));
        $("#olvOk").textContent = "Si hay una cuenta con ese correo, te llegará un enlace para cambiar la contraseña.";
      } else if (HC.olvPaso === 1) {
        const cel = $("#olvCelular").value;
        if (!/^9\d{8}$/.test(cel)) { $("#olvError").textContent = "9 dígitos y empieza con 9."; return; }
        await conBoton(btn, "Enviando código…", () => Cuenta.recuperarPersonalEnviar(cel));
        HC.olvPaso = 2; $("#olvPaso2").hidden = false; elegirOlvido("personal"); $("#olvCodigo").focus();
      } else {
        const c = $("#olvCodigo").value.trim(), clave = $("#olvClave").value;
        if (!/^\d{6}$/.test(c)) { $("#olvError").textContent = "Escribe el código de 6 dígitos."; return; }
        if (clave.length < 8) { $("#olvError").textContent = "La contraseña nueva debe tener al menos 8 caracteres."; return; }
        await conBoton(btn, "Cambiando…", () => Cuenta.recuperarPersonalConfirmar(c, clave));
        HC.olvPaso = 1; $("#olvClave").value = "";
        await despuesDeEntrar();
        toast("Contraseña cambiada. Ya entraste con tu cuenta.", 4500);
      }
    } catch (err) {
      $("#olvError").textContent = err.message;
      if (/no tiene una cuenta/.test(err.message)) { HC.olvPaso = 1; $("#olvPaso2").hidden = true; elegirOlvido("personal"); }
    }
  });

  // Mi cuenta
  $("#mcDetalles").addEventListener("toggle", () => { if ($("#mcDetalles").open) cargarMisDatos(); });
  $("#btnCerrarSesion").onclick = async () => {
    if (!confirm("¿Cerrar sesión en este celular?")) return;
    await Cuenta.salir(); cerrarCuenta(); toast("Sesión cerrada. Sigues viendo la app como invitado.");
  };

  // Cada cambio de sesión repinta lo que depende de la cuenta
  document.addEventListener("sesion", () => {
    renderBotonCuenta();
    aplicarModoAutoridad();
    const u = Cuenta.usuario;
    if (u && (u.tipo === "unt" || u.esAdmin) && document.visibilityState === "visible") Geocerca.iniciar(); else Geocerca.detener();
    pintarCampus();
    pintarReportes(); renderListas(); renderAdmin(); registrarVerificados();
    if (!$("#hojaReporte").hidden && Datos.modo !== "local" && Cuenta.motivoNoPuede(R.ambito || "ciudad")) cerrarReporte(false);
  });
  document.addEventListener("visibilitychange", () => {
    const u = Cuenta.usuario;
    if (document.visibilityState !== "visible") Geocerca.detener();
    else if (u && (u.tipo === "unt" || u.esAdmin)) Geocerca.iniciar();
  });
  document.addEventListener("geocerca", alCambiarGeocerca);
}

/* ---------------------------------------------------------------------
   GEOCERCA DEL CAMPUS UNT (cuentas UNT y admins, con la app abierta y visible)
--------------------------------------------------------------------- */
const Geocerca = {
  enCampus: false, ultimo: null, _id: null, _pendiente: null, _racha: 0,
  iniciar() {
    if (this._id !== null || !navigator.geolocation) return;
    this._id = navigator.geolocation.watchPosition((p) => this._leer(p), () => this._cambiar(false),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  },
  detener() {
    if (this._id !== null) navigator.geolocation.clearWatch(this._id);
    this._id = null; this._pendiente = null; this._racha = 0; this._cambiar(false);
  },
  _leer(p) {
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    this.ultimo = { lat, lng, precision: Math.round(accuracy), t: Date.now() };
    const dentro = accuracy <= 60 && dentroDelCampus(lat, lng);
    if (dentro === this._pendiente) this._racha++; else { this._pendiente = dentro; this._racha = 1; }
    if (this._racha >= 2) this._cambiar(dentro); // 2 lecturas seguidas: evita parpadeos en el borde
  },
  _cambiar(v) {
    if (v === this.enCampus) return;
    this.enCampus = v;
    document.dispatchEvent(new CustomEvent("geocerca", { detail: { enCampus: v } }));
  }
};
function alCambiarGeocerca() {
  $("#chipCampus").hidden = !Geocerca.enCampus;
  if ($("#hojaReporte").hidden) return;
  pintarAmbito();
  if (R.ambito === "unt" && !Geocerca.enCampus) $("#textoUbicacion").textContent = "Saliste del campus UNT: no puedes enviar este reporte.";
  else if (R.ambito === "unt" && Geocerca.ultimo) fijarUbicacionReporte(Geocerca.ultimo.lat, Geocerca.ultimo.lng, `GPS ±${Geocerca.ultimo.precision} m`);
  validarFormReporte();
}
/* Lectura de GPS válida para enviar un reporte del campus: reciente, precisa y dentro */
function lecturaCampusValida() {
  const g = Geocerca.ultimo;
  return !!(g && Date.now() - g.t < 60000 && g.precision <= 60 && dentroDelCampus(g.lat, g.lng));
}
function pintarCampus() {
  if (!mapa) return;
  if (!capas.campus) capas.campus = L.layerGroup().addTo(mapa);
  capas.campus.clearLayers();
  const u = Cuenta.usuario;
  if (!u || !(u.tipo === "unt" || u.esAdmin)) return;
  L.polygon(CAMPUS_UNT.map(([lng, lat]) => [lat, lng]), { color: "#283593", weight: 2, dashArray: "6 6", fillColor: "#283593", fillOpacity: 0.05, interactive: false })
    .addTo(capas.campus);
}

/* ---------- Reporte: ámbito (ciudad / campus UNT) según la cuenta ---------- */
function ambitosPosibles() {
  const u = Cuenta.usuario;
  if (Datos.modo === "local" || !firebaseConfigurado()) return ["ciudad"];
  if (u && u.esAdmin) return ["ciudad", "unt"];
  if (u && u.tipo === "unt") return ["unt"];
  return ["ciudad"];
}
function abrirReporteNuevo() {
  if (Datos.modo === "local") { R.ambito = "ciudad"; pintarAmbito(); abrirReporte(); return; }
  const posibles = ambitosPosibles();
  const amb = R.ambito && posibles.includes(R.ambito) ? R.ambito : posibles[0];
  if (!puertaCuenta(amb, abrirReporteNuevo)) return;
  if (amb === "unt" && !Cuenta.usuario.esAdmin && !Geocerca.enCampus) {
    Geocerca.iniciar();
    toast("Con tu cuenta UNT solo reportas dentro del campus. Si ya estás dentro, activa tu ubicación y espera unos segundos.", 6000);
    return;
  }
  elegirAmbito(amb);
  abrirReporte();
}
function elegirAmbito(amb) {
  const cambio = R.ambito !== amb;
  R.ambito = amb;
  if (amb === "unt" && (cambio || R.forma !== "punto")) elegirForma("punto"); // el campus va como punto, con el GPS
  pintarAmbito();
  if (amb === "unt" && lecturaCampusValida()) fijarUbicacionReporte(Geocerca.ultimo.lat, Geocerca.ultimo.lng, `GPS ±${Geocerca.ultimo.precision} m`);
}
function pintarAmbito() {
  const posibles = ambitosPosibles(), amb = R.ambito || "ciudad";
  $("#fsAmbito").hidden = !(posibles.length > 1 || amb === "unt");
  $$(".opcion-ambito").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.ambito === amb));
    b.disabled = !posibles.includes(b.dataset.ambito) || (b.dataset.ambito === "unt" && !Geocerca.enCampus && amb !== "unt");
  });
  $("#textoAmbito").textContent = amb === "unt"
    ? (Geocerca.enCampus ? "Estás dentro del campus. Se usa tu ubicación GPS; lo validan otras cuentas UNT." : "Fuera del campus: no puedes enviar un reporte del campus.")
    : posibles.includes("unt") && !Geocerca.enCampus ? "Campus UNT: solo cuando estés dentro del campus." : "";
  $("#selectorForma").hidden = amb === "unt";
  $("#notaReporte").textContent = amb === "unt" ? "Se verá en gris hasta que 3 cuentas UNT lo confirmen." : "Se verá en gris hasta que 3 vecinos lo confirmen.";
  actualizarBotonesUbicacion();
}

/* ---------------------------------------------------------------------
   NAVEGACIÓN
--------------------------------------------------------------------- */
function irATab(nombre) {
  // Enlaces antiguos a "preparate" (y los nuevos a noticias/conocenos) abren Info en esa pestaña
  if (SUBTABS_INFO.includes(nombre)) { elegirSubInfo(nombre); nombre = "info"; }
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
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => {
    irATab(b.dataset.tab);
    if (b.dataset.tab === "mapa") centrarEnMi(true); // al entrar al mapa, como en Google Maps: te ubica en tu punto
  }));
  $("#btnRutaEmergencia").onclick = () => mostrarEvacuacion();
  $("#listaAcciones").onclick = (ev) => { if (ev.target.closest("[data-evac]")) mostrarEvacuacion(); };
  $("#btnCerrarAlarma").onclick = cerrarAlarma;
  $("#bannerEmergencia").onclick = abrirAlarma;
  $("#btnReportarInicio").onclick = abrirReporteNuevo;
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irATab(b.dataset.ir)));
  prepararSubtabs();
  // Enlaces directos: #info, #preparate, #noticias, #conocenos
  const porHash = () => { const h = location.hash.slice(1); if (h === "info" || SUBTABS_INFO.includes(h)) irATab(h); };
  window.addEventListener("hashchange", porHash);
  porHash();
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
    const capa = b.dataset.capa;
    if (capa === "buzonetas") { activarBuzonetas(on); return; }
    const grupos = capa === "reportes" ? [capas.reportes, capas.bloqueos] : [capas.cauce];
    grupos.forEach((g) => on ? g.addTo(mapa) : g.remove());
    renderLeyenda();
  }));
  $("#btnLeyenda").onclick = () => abrirLeyenda($("#leyendaMapa").hidden);
  $("#btnCerrarLeyenda").onclick = () => { abrirLeyenda(false); $("#btnLeyenda").focus(); };
  $("#btnCentrarme").onclick = () => centrarEnMi(false);
  $("#guiaNiveles").addEventListener("click", (ev) => {
    const b = ev.target.closest(".nivel-sel"); if (!b) return;
    nivelGuia = Number(b.dataset.n); renderGuia();
  });
  let lluviaCargada = false;
  $("#detLluvia").addEventListener("toggle", () => { if ($("#detLluvia").open && !lluviaCargada) { lluviaCargada = true; cargarLluviaHistorica(); } });
  $("#btnCerrarEvac").onclick = () => { $("#panelEvac").hidden = true; capas.evac?.clearLayers(); };
  $("#btnReportar").onclick = abrirReporteNuevo;
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
  prepararCuentas();
  prepararAdmin();
  prepararBotonNotif();
  renderLineaTiempo();
  renderPreparate();

  cargarDatosGuardados();
  await Datos.init();
  if (Datos._emu) window.PREVIUNT = { S, Datos, Cuenta, verReporteEnMapa, irATab }; // solo con ?emu=1 en localhost (pruebas)
  renderBadgeConexion();
  renderTodo(); // pinta enseguida el dato guardado (o "Sin datos") sin esperar al servidor
  $("#listaPendientes").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-cola]"); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.cola === "describir") {
      const t = $("#desc-" + CSS.escape(id)), txt = (t?.value || "").trim().slice(0, 200);
      if (!tieneTexto(txt)) { toast("Describe lo que ocurrió."); t?.focus(); return; }
      await Cola.describir(id, txt); return;
    }
    if (b.dataset.cola === "descartar") { if (confirm("¿Descartar este reporte? Se borrará de tu celular sin enviarse.")) await Cola.descartar(id); }
    if (b.dataset.cola === "sesion") {
      const it = Cola.items.find((x) => x.id === id);
      if (Datos.modo !== "local" && it && !puertaCuenta(it.datos.ambito || "ciudad")) return;
      await Cola.usarSesionActual(id);
    }
    if (b.dataset.cola === "reintentar") { const it = Cola.items.find((x) => x.id === id); if (it) { it.proximo = 0; Cola.ejecutar(); } }
  });
  await Cola.cargar();
  // Reintentos: al volver la red, al volver a la app y al abrirla (no depende de Background Sync)
  window.addEventListener("online", () => { Red.enLinea = true; Cola.ejecutar(); if (!S.clima || S.climaGuardado) cargarClima(); });
  window.addEventListener("offline", () => { Red.enLinea = false; renderBadgeConexion(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") Cola.ejecutar(); });
  setInterval(renderPendientes, 30000);

  Datos.suscribir("sensor", (v) => { S.sensor = v; renderTodo(); });
  Datos.suscribir("demo", (v) => { S.demo = v || { activo: false, nivel: 0 }; renderTodo(); });
  // Los conteos de votos se calculan desde /votos (un voto por cuenta) y se copian al reporte en memoria
  const alCambiarReportes = () => {
    if (Datos.modo !== "local") mezclarVotos(S.reportes, S.votos);
    pintarReportes(); renderTodo(); renderListas(); renderBotonCuenta();
    registrarVerificados();
  };
  Datos.suscribir("reportes", (v) => { S.reportes = v || {}; alCambiarReportes(); });
  Datos.suscribir("votos", (v) => { S.votos = v || {}; alCambiarReportes(); });
  Datos.suscribir("perfiles", (v) => { S.perfiles = v || {}; renderBotonCuenta(); pintarReportes(); renderAdmin(); });
  Datos.suscribir("verificados", (v) => {
    S.verificados = v || {}; S._verificadosCargados = true;
    renderBotonCuenta(); pintarReportes(); renderAdmin(); registrarVerificados();
    if (HC.pantalla === "micuenta") renderMiCuenta();
  });
  Datos.suscribir("bloqueados", (v) => { S.bloqueados = v || {}; renderBotonCuenta(); renderAdmin(); });
  Datos.suscribir("historial", (v) => { S.historial = v || {}; renderRegistro(); });

  // Revisión periódica: antigüedad del sensor y caducidad de reportes
  setInterval(() => { renderTodo(); pintarReportes(false); }, 5000);

  // Ubicación: si ya dio permiso antes, usarla sin preguntar
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" });
    if (p?.state === "granted" || lsGet("previunt_geoOK", false) && p?.state !== "denied") await pedirUbicacion({ silencioso: true });
  } catch {}
  cargarClima();
  setInterval(() => { if (navigator.onLine !== false) cargarClima(); }, 10 * 60 * 1000);
  setInterval(renderListas, 60 * 1000); // refresca "hace X min" y caducidad
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e)));
}

iniciar();
