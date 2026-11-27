/*
 * PREVIUNT - Receptor de alerta para ESP32 + buzzer
 *
 * Lee la alerta OFICIAL de su zona en Firebase Realtime Database (/alertas/{zona}) con su PROPIA cuenta
 * de dispositivo. Ese nodo NO es público: las reglas solo dejan leerlo a los dispositivos activos de esa
 * zona (/dispositivos/{uid}) y solo los admins (autoridad) pueden escribirlo, siempre junto con el estado
 * oficial /quebrada_san_ildefonso en la misma escritura. Detalles y configuración: maqueta/LEEME.md
 *
 * Proyecto PlatformIO (VS Code): abrir la carpeta maqueta/AlarmaPREVIUNT (la que tiene platformio.ini).
 *   Placa: esp32dev · Biblioteca: ArduinoJson 7.x (se instala sola con lib_deps)
 *   Antes de compilar: copiar include/secretos.ejemplo.h como include/secretos.h y completarlo.
 *
 * Formato de /alertas/{zona} (horas Unix UTC en segundos):
 * { "level": 3, "origin": "authority", "zone": "san-ildefonso-01",
 *   "eventId": "evt-1795700000-ab12cd", "updatedAt": 1795700000, "validUntil": 1795703600 }
 * level 3 = DESBORDE. level 0, 1 o 2 = despeje. Una alerta vencida (now > validUntil) se toma como despeje.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#if __has_include("secretos.h")
#include "secretos.h"
#else
#error "Falta include/secretos.h: copia include/secretos.ejemplo.h como include/secretos.h y complétalo (no lo subas a Git)."
#endif
#include "certificados.h"  // raíces de Google Trust Services (públicas)

// ---------------- Hardware ----------------
constexpr int BUZZER_PIN = 32;              // GPIO32 → resistencia 1 kΩ → base de transistor NPN (ver LEEME.md)
constexpr bool BUZZER_ACTIVE_HIGH = true;
constexpr bool BUZZER_PASIVO = false;       // true = buzzer pasivo: toca 520/650/780 Hz como la app

// Secuencia de la alarma (igual que la app): 3 tonos de 233 ms cada 350 ms y pausa; ciclo de 2,1 s.
struct Paso { uint16_t hz; uint16_t ms; };
constexpr Paso SECUENCIA[] = { {520, 233}, {0, 117}, {650, 233}, {0, 117}, {780, 233}, {0, 1167} };
constexpr size_t N_PASOS = sizeof(SECUENCIA) / sizeof(SECUENCIA[0]);

// ---------------- Tiempos y límites ----------------
constexpr uint32_t POLL_MS = 3000;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t HTTP_TIMEOUT_MS = 6000;
constexpr uint32_t AUTH_RETRY_MS = 30000;          // espera tras un fallo de inicio de sesión
constexpr uint32_t TOKEN_MARGIN_MS = 5UL * 60 * 1000; // renovar el token 5 min antes de que venza
constexpr uint32_t MAX_FUTURE_SKEW_SEC = 30;
constexpr uint32_t MAX_VALIDITY_SEC = 3600;

WiFiClientSecure tls;
bool alarmLatched = false;
String activeEventId;
String candidateEventId;
String clearCandidateEventId;
uint8_t sameCandidateCount = 0;
uint8_t clearCandidateCount = 0;
uint32_t lastPoll = 0;
uint32_t lastWifiAttempt = 0;
bool wifiEverAttempted = false;
bool wifiWasConnected = false;
bool clockWasReady = false;
uint32_t lastClockMsg = 0;

// Sesión de Firebase Auth del dispositivo
String idToken;
String refreshToken;
uint32_t tokenExpiresAtMs = 0;
uint32_t lastAuthAttempt = 0;
bool authEverAttempted = false;

// Estado del buzzer
size_t paso = 0;
uint32_t pasoDesde = 0;
bool buzzerOn = false;

// ---------------- Buzzer ----------------
void buzzerTone(uint16_t hz) {
  buzzerOn = hz > 0;
  if (BUZZER_PASIVO) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(BUZZER_PIN, hz);
#else
    ledcWriteTone(0, hz);
#endif
    return;
  }
  const bool level = BUZZER_ACTIVE_HIGH ? buzzerOn : !buzzerOn;
  digitalWrite(BUZZER_PIN, level ? HIGH : LOW);
}

void failClosedAtBoot() {
  if (BUZZER_PASIVO) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcAttach(BUZZER_PIN, 2000, 10);
#else
    ledcSetup(0, 2000, 10);
    ledcAttachPin(BUZZER_PIN, 0);
#endif
  } else {
    pinMode(BUZZER_PIN, OUTPUT);
  }
  buzzerTone(0);  // salida siempre apagada al arrancar/reiniciar
}

void updateBuzzer() {
  if (!alarmLatched) {
    if (buzzerOn) buzzerTone(0);
    return;
  }
  const uint32_t now = millis();
  if (now - pasoDesde >= SECUENCIA[paso].ms) {
    paso = (paso + 1) % N_PASOS;
    pasoDesde = now;
    buzzerTone(SECUENCIA[paso].hz);
  }
}

void startAlarmSound() {
  paso = 0;
  pasoDesde = millis();
  buzzerTone(SECUENCIA[0].hz);
}

// ---------------- Configuración ----------------
bool secretsConfigured() {
  return String(WIFI_SSID) != "CAMBIAR_WIFI" &&
         String(WIFI_PASSWORD) != "CAMBIAR_CLAVE_WIFI" &&
         String(FIREBASE_API_KEY).indexOf("CAMBIAR") < 0 &&
         String(DATABASE_URL).startsWith("https://") &&
         String(DEVICE_EMAIL).indexOf("CAMBIAR") < 0 &&
         String(DEVICE_PASSWORD).indexOf("CAMBIAR") < 0 &&
         String(EXPECTED_ZONE).length() > 0;
}

void connectWiFi() {
  if (!secretsConfigured()) return;
  if (WiFi.status() == WL_CONNECTED) return;
  const uint32_t now = millis();
  if (wifiEverAttempted && now - lastWifiAttempt < WIFI_RETRY_MS) return;  // el primer intento es inmediato
  wifiEverAttempted = true;
  lastWifiAttempt = now;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Conectando a Wi-Fi...");
}

bool clockReady() {
  const time_t now = time(nullptr);
  return now > 1700000000;  // evita validar TLS y vigencias antes de tener hora NTP
}

// Mensajes de estado en el monitor serie (solo cuando algo cambia)
void reportStatus() {
  const bool wifi = WiFi.status() == WL_CONNECTED;
  if (wifi && !wifiWasConnected) {
    Serial.printf("Wi-Fi conectado: IP %s, señal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else if (!wifi && wifiWasConnected) {
    Serial.println("Wi-Fi desconectado; reintentando. El buzzer conserva su estado.");
  }
  wifiWasConnected = wifi;
  if (!wifi) return;
  const bool ready = clockReady();
  if (ready && !clockWasReady) {
    const time_t t = time(nullptr);
    struct tm utc;
    gmtime_r(&t, &utc);
    Serial.printf("Hora sincronizada (UTC): %04d-%02d-%02d %02d:%02d:%02d\n", utc.tm_year + 1900, utc.tm_mon + 1,
                  utc.tm_mday, utc.tm_hour, utc.tm_min, utc.tm_sec);
  } else if (!ready && millis() - lastClockMsg >= 10000) {
    lastClockMsg = millis();
    Serial.println("Esperando la hora de Internet (NTP)...");
  }
  clockWasReady = ready;
}

// ---------------- HTTPS ----------------
// Hace una petición HTTPS validando el certificado contra las raíces de Google. Devuelve el código HTTP
// (o un número negativo si falló la conexión). No sigue redirecciones.
int httpsRequest(const String &url, const char *method, const String &contentType,
                 const String &payload, String &response) {
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, url)) return -1000;
  http.addHeader("Accept", "application/json");
  int code;
  if (strcmp(method, "POST") == 0) {
    http.addHeader("Content-Type", contentType);
    code = http.POST(payload);
  } else {
    code = http.GET();
  }
  response = code > 0 ? http.getString() : String();
  http.end();
  return code;
}

// ---------------- Firebase Auth (cuenta propia del dispositivo) ----------------
bool saveTokens(const String &body, const char *idKey, const char *refreshKey, const char *expiresKey) {
  JsonDocument doc;
  if (deserializeJson(doc, body)) return false;
  if (!doc[idKey].is<const char *>() || !doc[refreshKey].is<const char *>()) return false;
  idToken = doc[idKey].as<String>();
  refreshToken = doc[refreshKey].as<String>();
  const uint32_t expiresSec = String(doc[expiresKey] | "3600").toInt();
  tokenExpiresAtMs = millis() + expiresSec * 1000UL;
  return idToken.length() > 0;
}

bool signIn() {
  JsonDocument req;
  req["email"] = DEVICE_EMAIL;
  req["password"] = DEVICE_PASSWORD;
  req["returnSecureToken"] = true;
  String payload, body;
  serializeJson(req, payload);
  const String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  const int code = httpsRequest(url, "POST", "application/json", payload, body);
  if (code != HTTP_CODE_OK) {
    // 400 = clave incorrecta, cuenta deshabilitada (revocada) o inexistente
    Serial.printf("Inicio de sesión del dispositivo rechazado (HTTP %d). Buzzer sin cambios.\n", code);
    return false;
  }
  if (!saveTokens(body, "idToken", "refreshToken", "expiresIn")) {
    Serial.println("Respuesta de inicio de sesión inválida.");
    return false;
  }
  Serial.println("Dispositivo autenticado.");
  return true;
}

bool refreshIdToken() {
  String body;
  const String url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
  const int code = httpsRequest(url, "POST", "application/x-www-form-urlencoded",
                                String("grant_type=refresh_token&refresh_token=") + refreshToken, body);
  if (code != HTTP_CODE_OK || !saveTokens(body, "id_token", "refresh_token", "expires_in")) {
    Serial.printf("No se pudo renovar el token (HTTP %d).\n", code);
    return false;
  }
  return true;
}

// Deja un idToken vigente. Si la cuenta fue desactivada, falla y no se consulta la alerta.
bool ensureToken() {
  const uint32_t now = millis();
  const bool vigente = idToken.length() > 0 && (int32_t)(tokenExpiresAtMs - now) > (int32_t)TOKEN_MARGIN_MS;
  if (vigente) return true;
  if (authEverAttempted && now - lastAuthAttempt < AUTH_RETRY_MS) return false;
  authEverAttempted = true;
  lastAuthAttempt = now;
  if (refreshToken.length() > 0 && refreshIdToken()) return true;
  idToken = "";
  refreshToken = "";
  return signIn();
}

// ---------------- Validación de la alerta ----------------
enum class Lectura { Invalida, Vigente, Vencida };

Lectura parseAndValidate(const String &body, int &level, String &eventId) {
  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("JSON inválido: %s\n", err.c_str());
    return Lectura::Invalida;
  }
  if (doc.isNull()) {
    Serial.println("No hay alerta publicada para esta zona; buzzer sin cambios.");
    return Lectura::Invalida;
  }
  if (!doc["level"].is<int>() || !doc["origin"].is<const char *>() ||
      !doc["zone"].is<const char *>() || !doc["eventId"].is<const char *>() ||
      !doc["updatedAt"].is<uint32_t>() || !doc["validUntil"].is<uint32_t>()) {
    Serial.println("Respuesta incompleta; no se acciona buzzer.");
    return Lectura::Invalida;
  }
  level = doc["level"].as<int>();
  const String origin = doc["origin"].as<String>();
  const String zone = doc["zone"].as<String>();
  eventId = doc["eventId"].as<String>();
  const uint32_t updatedAt = doc["updatedAt"].as<uint32_t>();
  const uint32_t validUntil = doc["validUntil"].as<uint32_t>();

  if (origin != "authority" || zone != EXPECTED_ZONE || eventId.isEmpty()) {
    Serial.println("Fuente, zona o evento no autorizados; ignorado.");
    return Lectura::Invalida;
  }
  if (level < 0 || level > 3) {
    Serial.println("Nivel fuera de rango; ignorado.");
    return Lectura::Invalida;
  }
  const uint32_t now = (uint32_t)time(nullptr);
  if (updatedAt > now + MAX_FUTURE_SKEW_SEC || validUntil <= updatedAt ||
      validUntil - updatedAt > MAX_VALIDITY_SEC) {
    Serial.println("Hora o vigencia inválidas; ignorado.");
    return Lectura::Invalida;
  }
  if (now > validUntil) return Lectura::Vencida;  // la autoridad no la renovó: cuenta como despeje
  return Lectura::Vigente;
}

void acceptResponse(int level, const String &eventId) {
  // Dos lecturas consecutivas del mismo evento reducen activaciones por ruido.
  if (level == 3) {
    clearCandidateCount = 0;
    clearCandidateEventId = "";
    if (eventId == activeEventId && alarmLatched) return;
    if (candidateEventId == eventId) {
      if (sameCandidateCount < 2) sameCandidateCount++;
    } else {
      candidateEventId = eventId;
      sameCandidateCount = 1;
    }
    if (sameCandidateCount >= 2) {
      activeEventId = eventId;
      alarmLatched = true;
      startAlarmSound();
      Serial.printf("ALERTA AUTORIZADA: %s\n", activeEventId.c_str());
    } else {
      Serial.println("Desborde candidato; esperando segunda lectura igual.");
    }
    return;
  }

  candidateEventId = "";
  sameCandidateCount = 0;
  if (!alarmLatched) return;

  // La alarma queda enclavada hasta recibir dos estados válidos de despeje.
  if (clearCandidateEventId == eventId) {
    if (clearCandidateCount < 2) clearCandidateCount++;
  } else {
    clearCandidateEventId = eventId;
    clearCandidateCount = 1;
  }
  if (clearCandidateCount >= 2) {
    alarmLatched = false;
    activeEventId = "";
    clearCandidateCount = 0;
    clearCandidateEventId = "";
    buzzerTone(0);
    Serial.println("Despeje autorizado; buzzer apagado.");
  } else {
    Serial.println("Despeje candidato; esperando segunda lectura.");
  }
}

void pollAlert() {
  if (WiFi.status() != WL_CONNECTED || !clockReady()) return;
  if (!ensureToken()) return;  // sin sesión válida no se cambia el estado del buzzer

  String body;
  const String url = String(DATABASE_URL) + "/alertas/" + EXPECTED_ZONE + ".json?auth=" + idToken;
  const int code = httpsRequest(url, "GET", "", "", body);
  if (code == 401 || code == 403) {
    // Token vencido o dispositivo revocado/sin permiso para esta zona
    Serial.printf("Firebase HTTP %d (sin permiso); se pedirá un token nuevo. Estado anterior conservado.\n", code);
    idToken = "";
    return;
  }
  if (code != HTTP_CODE_OK) {
    Serial.printf("Firebase HTTP %d; estado anterior conservado.\n", code);
    return;
  }

  int level = -1;
  String eventId;
  switch (parseAndValidate(body, level, eventId)) {
    case Lectura::Invalida:
      return;  // nunca crea ni apaga una alarma
    case Lectura::Vencida:
      if (level == 3) Serial.println("Desborde vencido: se toma como despeje.");
      acceptResponse(0, eventId + "#vencido");
      return;
    case Lectura::Vigente:
      acceptResponse(level, eventId);
      return;
  }
}

void setup() {
  failClosedAtBoot();
  Serial.begin(115200);
  delay(100);

  if (!secretsConfigured()) {
    Serial.println("Falta completar secretos.h (Wi-Fi, API key, cuenta del dispositivo y zona). Buzzer apagado.");
    return;
  }

  alarmLatched = false;  // tras reinicio no restaurar una alarma antigua
  tls.setCACert(ROOT_CA_GOOGLE);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  connectWiFi();
  Serial.printf("Receptor PREVIUNT listo (zona %s). La salida sigue apagada hasta validar la alerta.\n", EXPECTED_ZONE);
}

void loop() {
  connectWiFi();
  if (secretsConfigured()) reportStatus();
  const uint32_t now = millis();
  if (secretsConfigured() && now - lastPoll >= POLL_MS) {
    lastPoll = now;
    pollAlert();
  }
  updateBuzzer();
  delay(10);
}
