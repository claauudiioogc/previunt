# Maqueta: sirena física con ESP32 (PREVIUNT)

El ESP32 hace sonar un buzzer **solo cuando la autoridad publica DESBORDE** (nivel 3) desde la pestaña Control de la app.

## Cómo funciona

```
Admin en Control ──publica──► /quebrada_san_ildefonso  (público: lo lee la app)
                   (misma      /alertas/san-ildefonso-01 (privado: solo lo leen los ESP32 de esa zona)
                   escritura)          │
                                       ▼  HTTPS + token de la cuenta propia del ESP32
                                    ESP32 ──► buzzer
```

- **Fuente de verdad:** `/quebrada_san_ildefonso` (nivel 0–3; 3 = DESBORDE). No hay un campo booleano aparte.
  Cada publicación lleva `zona`, `eventId`, `updatedAt` y `validUntil` (segundos Unix UTC).
- **`/alertas/{zona}`** es el espejo que leen los dispositivos, con el formato que espera el ESP32:
  ```json
  { "level": 3, "origin": "authority", "zone": "san-ildefonso-01",
    "eventId": "evt-1795700000-ab12cd", "updatedAt": 1795700000, "validUntil": 1795703600 }
  ```
  Las reglas **solo aceptan** escribir el estado oficial y su espejo **juntos y con el mismo nivel, eventId y vigencia**.
- **Quién escribe:** solo cuentas en `/admins/{uid}`. Las reglas lo comprueban en el servidor. El modo autoridad de la
  interfaz o `localStorage` no dan ningún permiso. Los ESP32 y las cuentas comunes **no** pueden escribir.
- **Quién lee `/alertas/{zona}`:** solo los admins y los dispositivos con `/dispositivos/{uid}` = `{ zona: esa zona, activo: true }`.
  No es una ruta pública.
- **Vigencia:** cada alerta vale como máximo 1 hora. Mientras un admin tenga la pestaña Control abierta y el desborde
  siga, la app la renueva sola con el mismo `eventId` (también hay un botón «Renovar»). Si nadie la renueva, el ESP32
  la toma como **despeje** cuando vence: una alerta vieja nunca queda sonando para siempre.
- **El ESP32:** necesita **dos lecturas seguidas del mismo evento** para encender y **dos lecturas válidas de despeje**
  para apagar. Los errores de red, las respuestas inválidas, la falta de sesión o los permisos denegados **no cambian**
  el buzzer: no crean una alarma nueva y tampoco apagan una que ya está sonando.
- **Sin Cloud Functions:** el proyecto está en el plan gratis (Spark), que no permite Cloud Functions. Cada ESP32 usa su
  **propia cuenta** de Firebase Authentication (revocable) y lee directamente su nodo privado por HTTPS.
- **Simulación:** el modo Simulación de Control escribe en `/demo`. No toca `/alertas` ni hace sonar la sirena física.

## Hardware

| Pieza | Recomendación |
| --- | --- |
| Placa | ESP32 DevKit (ESP32-WROOM-32) |
| Buzzer | **Activo** de 5 V (suena solo con corriente). Opcional: pasivo, para tocar las mismas notas que la app |
| Transistor | NPN 2N2222 o S8050 |
| Resistencias | 1 kΩ (base del transistor) |
| Diodo | 1N4148 en paralelo con el buzzer **si es magnético** (cátodo a +5 V). Un piezo no lo necesita |

**Cableado (buzzer activo con transistor):**

| Desde | Hacia |
| --- | --- |
| GPIO **32** del ESP32 | Resistencia 1 kΩ → **base** del transistor |
| **Emisor** del transistor | GND |
| **Colector** del transistor | Pata **−** del buzzer |
| Pata **+** del buzzer | **5 V** (pin VIN o 5V del ESP32, alimentado por USB) |
| GND del ESP32 | GND común |

El pin se cambia en `BUZZER_PIN` de `src/main.cpp`. **El GPIO da 3,3 V, no 5 V**, y solo mientras suena la alarma. Los 5 V del buzzer
salen del pin VIN/5V; el transistor solo los conecta. **Prueba del buzzer sin Firebase:** con el ESP32 por USB,
escribe `p` en el Serial Monitor y suena 3 segundos. No conectes un buzzer de 5 V directo al GPIO: el ESP32 da 3,3 V y poca corriente.

**Velocidad y sonido.** El ESP32 consulta Firebase cada 1 s (`POLL_MS`) con la conexión segura abierta
(keep-alive), así que el Desborde suena en unos 2–3 s. El sonido se elige con `SONIDO` (1 = igual que la app,
2 = despertador bip-bip-bip-bip). Un buzzer **activo** tiene un tono fijo y solo cambia el ritmo; para los
mismos Hz que la app usa un buzzer **pasivo** y pon `BUZZER_PASIVO = true`.
Para un buzzer **pasivo**, pon `BUZZER_PASIVO = true` y conéctalo igual (por el transistor).

## Software (VS Code + PlatformIO)

Estructura del proyecto (carpeta `maqueta/AlarmaPREVIUNT/`):

```
AlarmaPREVIUNT/
├── platformio.ini              placa esp32dev, ArduinoJson 7.x (se instala sola), monitor a 115200
├── src/main.cpp                el programa
└── include/
    ├── certificados.h          raíces públicas de Google Trust Services (validan TLS; no se usa setInsecure())
    ├── secretos.ejemplo.h      plantilla
    └── secretos.h              ← lo creas tú copiando la plantilla (está en .gitignore)
```

1. Instala **VS Code** y la extensión **PlatformIO IDE**.
2. *File → Open Folder…* → abre la carpeta `AlarmaPREVIUNT`, la que tiene `platformio.ini`. La primera vez,
   PlatformIO descarga la plataforma ESP32 y ArduinoJson.
3. Copia `include/secretos.ejemplo.h` como `include/secretos.h` y complétalo (tabla de abajo).
4. Conecta el ESP32 por USB. En la barra inferior de PlatformIO: **✓ Build**, **→ Upload** y **🔌 Serial Monitor**
   (115200 baudios).
   Si no sube, mantén apretado el botón **BOOT** del ESP32 mientras dice "Connecting…".

Se comprobó que compila sin advertencias con los dos núcleos de Arduino para ESP32: **2.0.17**, el que instala la
plataforma `espressif32` de PlatformIO, y **3.0.7**. Usa ArduinoJson 7.2.1.

### Qué completar en `secretos.h`

| Variable | Valor | ¿Es secreto? |
| --- | --- | --- |
| `WIFI_SSID`, `WIFI_PASSWORD` | Wi-Fi del lugar | **Sí** |
| `FIREBASE_API_KEY` | El `apiKey` de `FIREBASE_CONFIG` en `app.js` | No (ya es público en la app) |
| `DATABASE_URL` | `https://previunt-default-rtdb.firebaseio.com` | No |
| `DEVICE_EMAIL` | Correo de la cuenta del dispositivo, p. ej. `esp32-01@dispositivos.previunt.invalid` | No |
| `DEVICE_PASSWORD` | Contraseña larga y aleatoria de esa cuenta | **Sí** |
| `EXPECTED_ZONE` | `prueba-01` (banco de pruebas) o `san-ildefonso-01` (real) | No |

Guarda los secretos solo en `secretos.h` (en tu PC) y en `CUENTAS_DE_PRUEBA_NO_SUBIR.md`. **Nunca en Git.**

## Configuración en Firebase (una sola vez)

1. **Publicar las reglas** de `database.rules.json`, **en el mismo momento** en que se fusiona el código nuevo de la app:
   - por la consola: *Realtime Database → Rules* → pegar → *Publish*; o
   - con la CLI, desde la raíz del repositorio: `npx firebase-tools login` y luego
     `npx firebase-tools deploy --only database --project previunt`.
2. **Publicar un estado oficial con la app nueva.** En Control, desmarca *Simulación*, escribe la fuente y toca **Seco**.
   Así se crean `eventId` y `/alertas/san-ildefonso-01`.
3. **Crear la cuenta del dispositivo:** *Authentication → Users → Add user*:
   - correo `esp32-01@dispositivos.previunt.invalid`;
   - contraseña generada, por ejemplo con `openssl rand -base64 24` o con un gestor de contraseñas.

   Copia el **User UID**. Usa una cuenta distinta para cada ESP32.
4. **Registrar el dispositivo:** *Realtime Database → Data* → crear
   `dispositivos/<UID>` = `{ "zona": "prueba-01", "activo": true, "nombre": "maqueta-1" }`.
   Cuando todo funcione, cambia `zona` a `san-ildefonso-01`.
5. **Revocar un dispositivo:** pon `activo: false` en `/dispositivos/<UID>` (efecto inmediato) o desactiva su cuenta en
   *Authentication → Users → ⋮ → Disable account* (efecto en menos de 1 hora, cuando vence su token).

## Probar antes de conectar hardware

Con la cuenta del dispositivo en la zona **`prueba-01`**, desde la raíz del repositorio (Node 18 o superior).

**Windows (PowerShell):**
```powershell
$env:FIREBASE_API_KEY="(apiKey de app.js)"; $env:DEVICE_EMAIL="esp32-01@dispositivos.previunt.invalid"
$env:DEVICE_PASSWORD="(clave del dispositivo)"; $env:ZONA="prueba-01"
node maqueta\probar_dispositivo.mjs --vigilar
```

**Linux/macOS:**
```bash
FIREBASE_API_KEY=... DEVICE_EMAIL=esp32-01@dispositivos.previunt.invalid DEVICE_PASSWORD=... ZONA=prueba-01 \
  node maqueta/probar_dispositivo.mjs --vigilar
```

El script hace lo mismo que el ESP32: inicia sesión, lee la alerta cada 3 s y aplica la misma lógica. Después:

1. En la app, entra como admin → *Control → Conexión y pruebas* → **Probar sirena física**. El script debe mostrar
   «desborde candidato» y, en la lectura siguiente, **«ACTIVA LA ALARMA»**. No cambia el estado oficial ni la app de nadie.
2. Toca **Apagar prueba**. Deben aparecer «despeje candidato» y **«APAGA LA ALARMA»**. Si no lo tocas, la prueba vence
   sola a los 2 minutos.
3. Cambia `ZONA` por `san-ildefonso-01` y vuelve a correr el script: debe responder **HTTP 401** (sin permiso), porque el
   dispositivo está registrado para `prueba-01`.

Recién entonces graba el ESP32 (**Upload**) con `EXPECTED_ZONE = "prueba-01"` y repite los pasos 1 y 2 mirando el
**Serial Monitor** de PlatformIO (115200 baudios). Cuando suene bien, cambia la zona del dispositivo a `san-ildefonso-01`, en `secretos.h` **y** en
`/dispositivos/<UID>`.

## Lo que se probó y lo que no

- **Probado:**
  - reglas con los emuladores oficiales de Firebase (`pruebas/prueba_reglas.mjs`);
  - cadena completa del dispositivo contra los emuladores (`pruebas/prueba_dispositivo.mjs`): inicio de sesión,
    permisos por zona, revocación, 2 lecturas para encender y apagar, vencimiento y respuestas inválidas;
  - `src/main.cpp` **compila** para ESP32 con los núcleos 2.0.17 y 3.0.7 (ArduinoJson 7.2.1).
    No se pudo correr `pio run` en el entorno de Claude porque el registro de PlatformIO está bloqueado.
- **No probado:** el ESP32 físico, el buzzer, el Wi-Fi y la conexión TLS real con los servidores de Google. Tampoco el
  proyecto de producción: hay que publicar las reglas y seguir los pasos de arriba.
