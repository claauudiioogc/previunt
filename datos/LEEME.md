# Datos cartográficos estáticos

Se cargan desde el celular con rutas relativas (funcionan bajo `/previunt/` en GitHub Pages). No usan Firebase.

| Archivo | Qué es | Estado |
| --- | --- | --- |
| `buzonetas-trujillo-2026.geojson` | 30 buzonetas de captación pluvial B-1 a B-30. MPT, *Plan de Acción ante Lluvias Intensas y Peligros Asociados 2026*, anexos 15.1 (tabla 13, p. 33) y 15.2 (mapa 2, p. 34). Coordenadas convertidas desde la tabla UTM (EPSG:32717). B-1 a B-16: riesgo alto; B-17 a B-30: riesgo moderado. | Incluido. Puntos tal como en la tabla, sin ajustes. B-5 (CIDUNT) conserva su punto tabulado; no se revisó contra el escaneo del plano. |
| `territorios-vecinales.geojson` | Polígonos de territorios vecinales (PLANDET). Propiedades: `codigo` (p. ej. `TV17`), `nombre`, `fuente`. | **Falta.** Sin él, la capa muestra solo el catálogo y la leyenda. |
| `limite-provincial-trujillo.geojson` | Límite provincial de Trujillo. | **Falta.** |
| `campus_unt.geojson`, `hackaton.kmz` | Campus UNT (ya existentes). | Sin cambios. |

Los puntos críticos PC1–PC4 del plan de la Ruta del Agua están en `PUNTOS_CRITICOS` (app.js) con `lat`/`lng` en `null`: se dibujan cuando se agreguen las coordenadas de la fuente.
