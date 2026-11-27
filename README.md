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
| `pruebas/` | Pruebas con los emuladores de Firebase (ver `pruebas/LEEME.md`) |
| `maqueta/` | Sirena física con ESP32: programa, cableado, configuración y pruebas (ver `maqueta/LEEME.md`) |
| `firebase.json`, `.firebaserc` | Para publicar las reglas con la CLI (`npx firebase-tools deploy --only database`) y para los emuladores |
| `datos/` | Límite del campus UNT (`campus_unt.geojson`, `hackaton.kmz`, trazado por el equipo) |

## Probar en la PC
```bash
cd previunt
python -m http.server 8000
```
Abrir `http://localhost:8000`. Con Firebase configurado se usa el proyecto real: para probar sin tocarlo, usar los emuladores y abrir `http://localhost:8000/?emu=1` (ver `pruebas/LEEME.md`).
Solo en **modo local** (sin `FIREBASE_CONFIG`) el centro de control se abre con `?admin=1` o 5 toques en el logo.

## Conectar Firebase (cuando tengan la config)
1. Firebase console → Authentication → Método de acceso → habilitar **Anónimo**, **Correo electrónico/contraseña** y **Teléfono**.
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

## Cuentas y roles (v18)

- **Invitado** (sesión anónima): ve todo, no reporta ni vota.
- **Cuenta personal**: nombres, apellidos, usuario único, celular (código SMS), correo y DNI. Entra con **usuario + contraseña**. Reporta y vota en la **ciudad**.
- **Cuenta UNT**: con el correo `@unitru.edu.pe` (enlace de verificación al correo). Entra con **correo UNT + contraseña**. Reporta y vota **solo dentro del campus** (geocerca con el GPS).
- **Admin** (autoridad): cuentas creadas en la consola y marcadas en `/admins/{uid}`. Ven la pestaña **Control**, publican el estado, gestionan reportes y bloquean autores. Ya no existe `?admin=1` con Firebase.
- El perfil público es solo `usuario` + avatar (`/perfiles`). Nombres, DNI, celular y correo van en `/privado/{uid}`: solo los lee su dueño (ni los admins desde la app).
- Votos: uno por cuenta en `/votos/{reporte}/{uid}`. Reputación (Nuevo, Vecino, Vigía, Guardián, Centinela) calculada en cada celular con los reportes cargados (últimas 72 h).
- Reportes sin conexión: las reglas aceptan reportes de hasta **2 h** atrás; pasado eso, la cola los marca "No se envió a tiempo".
- Casilla de consentimiento de datos: **apagada** mientras sea una demo interna (`PEDIR_CONSENTIMIENTO` en `app.js`). Encenderla antes de abrir la app a gente real.
- Diseño completo: documento "PREVIUNT · Cuentas con registro, roles, reputación y reportes del campus UNT (versión 3)". Contraseñas de prueba: `CUENTAS_DE_PRUEBA_NO_SUBIR.md` (fuera del repositorio, en `.gitignore`).

**Seguridad: lo que ya se corrigió con las reglas de v18**
- `quebrada_san_ildefonso`, `demo` e `historial_nivel` solo los escriben admins (y dispositivos en `/dispositivos`, preparado para la maqueta). La sirena física sigue **leyendo** `nivel` sin cambios.
- Un reporte solo lo crea su autor con una cuenta verificada; nadie más lo modifica salvo los admins.

**Pendientes**
- Antes de usar la app con gente real: cambiar las contraseñas de los admins, quitar los números de prueba del SMS, poner `ANTIGUEDAD_MIN_MS` en 24 h y encender el consentimiento.
- Sirena física (ESP32): lee `/alertas/{zona}` (privado) con su propia cuenta; solo la autoridad publica, con vigencia de 1 h que la app de la autoridad renueva. Ver `maqueta/LEEME.md`. **Sin internet no suena.**
- (Antes) La sirena física leía `nivel` desde Firebase por WiFi: Propuesta: que el ESP32 sensor active la sirena directamente (cable o radio LoRa/ESP-NOW) por umbral local definido por quien calibre la maqueta, y use Firebase solo para difundir el estado a la app.
