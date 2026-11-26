# Pruebas de PREVIUNT (cuentas, reglas, campus y reputación)

Todo se prueba con los **emuladores oficiales de Firebase**. No se toca el proyecto real.
Las contraseñas de los admins de estas pruebas son de mentira (`clave-prueba-1`, etc.), no las reales.

| Archivo | Qué prueba | Necesita |
| --- | --- | --- |
| `prueba_campus_reputacion.mjs` | Polígono del campus, rectángulo de las reglas, votos y puntos | Solo Node |
| `prueba_reglas.mjs` | Reglas de `database.rules.json`: registro, reportes, cola sin conexión, fotos, votos y admin | Emulador de la base de datos |
| `prueba_flujo.html` + `correr_prueba_flujo.py` | Bloque `CUENTAS` de `app.js` en Chrome: registro con SMS, UNT con enlace, entrar, contraseña olvidada | Los dos emuladores |
| `prueba_app_ui.py` | La app completa (`index.html` + `app.js`) en un celular simulado: hojas, reportes, votos, campus y Control | Los dos emuladores |

Las pruebas leen el código **directamente de `app.js`** (entre las marcas `=== CUENTAS ===` y `=== CAMPUS Y REPUTACIÓN ===`), así siempre se prueba lo que se publica.

## Cómo correrlas (necesita Java 11+, Node 18+ y Python con Playwright)

```bash
cd pruebas
npm i
npm i leaflet@1.9.4 --no-save          # solo para prueba_app_ui.py
npx firebase setup:emulators:database   # descarga el emulador (una vez)
java -jar ~/.cache/firebase/emulators/firebase-database-emulator-v4.11.2.jar --port 9000 &
echo '{"emulators":{"auth":{"port":9099,"host":"127.0.0.1"},"ui":{"enabled":false}}}' > firebase.json
npx firebase emulators:start --only auth --project demo-previunt3 &

node prueba_campus_reputacion.mjs
node prueba_reglas.mjs
node preparar_emuladores.mjs && python3 correr_prueba_flujo.py
node preparar_emuladores.mjs && python3 prueba_app_ui.py   # capturas en pruebas/capturas/
```

## Probar la app a mano contra los emuladores

Con los emuladores corriendo y `node preparar_emuladores.mjs`:

```bash
cd ..            # raíz del repositorio
python3 -m http.server 8000
```

Abrir `http://localhost:8000/?emu=1`. Solo en `localhost` la app se conecta a los emuladores; en GitHub Pages `?emu=1` no hace nada.
Los códigos SMS del emulador se ven en `http://127.0.0.1:9099/emulator/v1/projects/demo-previunt3/verificationCodes`
y los enlaces de correo en `.../oobCodes`.
