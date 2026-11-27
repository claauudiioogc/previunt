/*
 * PLANTILLA de configuración del ESP32. Cópiala como "secretos.h" en esta misma carpeta (include/) y complétala.
 * "secretos.h" está en .gitignore: NUNCA lo subas al repositorio.
 */
#pragma once

// Wi-Fi del lugar donde estará la maqueta
static const char *WIFI_SSID     = "CAMBIAR_WIFI";
static const char *WIFI_PASSWORD = "CAMBIAR_CLAVE_WIFI";

// Proyecto Firebase (no son secretos: son los mismos de FIREBASE_CONFIG en app.js)
static const char *FIREBASE_API_KEY = "CAMBIAR_API_KEY_WEB";                          // apiKey de app.js
static const char *DATABASE_URL     = "https://previunt-default-rtdb.firebaseio.com"; // sin "/" al final

// Cuenta PROPIA de este dispositivo (Authentication → Users → Add user). Una por ESP32.
// Para revocarla: desactívala en Authentication o pon activo: false en /dispositivos/{UID}.
static const char *DEVICE_EMAIL    = "CAMBIAR_esp32-01@dispositivos.previunt.invalid";
static const char *DEVICE_PASSWORD = "CAMBIAR_CLAVE_LARGA_ALEATORIA";                // p. ej. openssl rand -base64 24

// Zona asignada (debe ser la misma que /dispositivos/{UID}/zona)
// "san-ildefonso-01" = estado oficial de la quebrada · "prueba-01" = banco de pruebas (botón en Control)
static const char *EXPECTED_ZONE = "san-ildefonso-01";
