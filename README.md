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
