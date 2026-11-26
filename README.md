# PREVIUNT – Alerta temprana quebrada San Ildefonso (Trujillo)

PWA estática (HTML + CSS + JS vanilla). No necesita compilar nada.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html` | Estructura de las 4 pestañas, hoja de reporte y centro de control |
| `styles.css` | Estilos y colores normados |
| `app.js` | Toda la lógica. **Arriba está el bloque `FIREBASE_CONFIG`** |
| `manifest.json`, `sw.js`, `icons/` | Instalación como app y funcionamiento sin conexión |
| `database.rules.json` | Reglas para pegar en Firebase Realtime Database |

## Probar en la PC
```bash
cd previunt
python -m http.server 8000
```
Abrir `http://localhost:8000`. Centro de control: `http://localhost:8000/?admin=1` o 5 toques en el logo.
Tip para la demo: abre el centro de control en una pestaña y la app en otra; en modo local se sincronizan.

## Conectar Firebase (cuando tengan la config)
1. Firebase console → Authentication → Método de acceso → habilitar **Anónimo**.
2. Realtime Database → Reglas → pegar `database.rules.json` → Publicar.
3. Configuración del proyecto → Tus apps → Web (`</>`) → copiar `firebaseConfig` y pegarlo en `FIREBASE_CONFIG` (arriba de `app.js`). `databaseURL` debe ser la misma URL que usan los ESP32.
4. Authentication → Configuración → Dominios autorizados → agregar `claauudiioogc.github.io`.

Si `FIREBASE_CONFIG` está vacío o Firebase falla, la app sigue funcionando en **modo local** (localStorage).

## Publicar en GitHub Pages
Subir todos los archivos (con la carpeta `icons/`) a la raíz del repo `previunt`, rama `main`.
Settings → Pages → Deploy from a branch → `main` / `(root)`.
Después de cada cambio, si el celular muestra la versión vieja, recarga dos veces (el service worker usa "red primero").

## Funcionamiento con poca o ninguna señal

**Qué funciona sin conexión**
- La app abre desde la caché del service worker (alcance `/previunt/`). Con red lenta, si un archivo tarda más de 3 s se usa la copia guardada y, durante 1 minuto, se sirve primero la copia.
- La librería de Firebase (gstatic, versión 10.12.2) también queda en caché. No se guardan en caché datos de la base, tokens ni inicio de sesión, ni Open-Meteo.
- El último estado de la quebrada, la demo, el historial y el clima recibidos se guardan en el celular. Sin conexión se muestran como **"Último dato guardado · puede estar desactualizado"**. Un dato guardado **nunca** abre la alarma, ni hace sonar la sirena de la app, ni envía notificaciones.
- Si no hay nada guardado, la tarjeta dice **"Sin datos"** (ya no muestra "Seco" por defecto).

**Reportes sin conexión (cola en IndexedDB)**
- Cada reporte se guarda primero en el celular (IndexedDB, con su foto) con un id único generado en el celular, y aparece en Inicio en "Tus reportes por enviar".
- Estados: Pendiente de envío → Enviando → Subiendo foto → Enviado. Si falla: "Error; se reintentará" con la hora del próximo intento.
- Al reconectar, al volver a la app y al abrirla se reintenta (no depende de Background Sync). Espera creciente con variación aleatoria: 5 s, 10 s, 20 s… hasta 10 min.
- Primero se envían los datos (transacción que solo crea el nodo si no existe: un reintento no duplica ni borra votos). Después, la foto en `/fotos/{id}`. La copia local se borra solo cuando el servidor confirma ambas cosas.
- Si el reporte se creó con otra sesión anónima, no se envía solo: la app pide "Enviar con mi sesión actual" o "Descartar".
- Fotos: se reducen a 800 px (JPEG 0,6); si pasan de ~280 KB se reducen a 640 px; si aún pasan, se rechazan con un mensaje. Las reglas aceptan < 400 000 caracteres por foto.
- Votos, estado oficial, simulación y gestión de reportes **no** se encolan: sin conexión se avisa y no se hace nada. Un reporte vecinal nunca cambia `/quebrada_san_ildefonso`.

**Menos tráfico**
- Reportes: solo los de las últimas 72 h y como máximo 300 (`orderByChild("creado")`). Historial: últimos 30.
- Requiere publicar en Firebase Console el índice `".indexOn": ["creado"]` de `database.rules.json`. Sin el índice la app funciona, pero Firebase descarga todos los reportes y filtra en el celular.

**Pendientes de seguridad (no se cambiaron)**
- `quebrada_san_ildefonso` tiene `.write: true`: cualquiera con la URL puede escribir el estado oficial y activar la sirena física. Hay que restringirlo (p. ej. a cuentas de autoridad y al ESP32 autenticado) antes de un uso real.
- `reportes/$id` permite que cualquier usuario autenticado modifique cualquier reporte (necesario hoy para los votos) y no valida `autor === auth.uid`.
- La sirena física (ESP32 #2) lee `nivel` desde Firebase por WiFi: **sin internet no suena**. Propuesta: que el ESP32 sensor active la sirena directamente (cable o radio LoRa/ESP-NOW) por umbral local definido por quien calibre la maqueta, y use Firebase solo para difundir el estado a la app.
