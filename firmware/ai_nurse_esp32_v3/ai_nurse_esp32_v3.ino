/**********************************************************************
 *  AI NURSE — ESP32 SMART CABIN FIRMWARE  (v4, Kiosk & Web-Serial Ready)
 *  Board: ESP32 Dev Module  |  Arduino IDE (ESP32 core 2.x/3.x)
 *
 *  Xususiyatlar:
 *   • MAX30105  → BPM + SpO2 (real-time, SparkFun algoritmi)
 *   • AHT10     → Havo harorati + namlik (I2C 0x38)
 *   • NTC 10K   → Suv harorati (PIN 34) + isitgich relyesi (PIN 18, hysterezis)
 *   • XKC-Y28   → Suyuqlik sensori (PIN 25) + servo klapan (PIN 13)
 *   • Antiseptik relyesi (PIN 19) — Planshet/Web buyrug'i orqali
 *   • Buzzer (PIN 33) — alerts_armed bo'lganda ogohlantirish signali
 *   • Web Serial (USB) → Wi-Fi SSID, Parol, Device ID va Tokenni
 *     Admin paneldan to'g'ridan-to'g'ri o'rnatish va NVS (Flash) xotirada saqlash!
 *   • Wi-Fi aloqasi doimiy va uzluksiz (BLE olib tashlangan, planshetga ko'chirilgan)
 *
 *  KUTUBXONALAR (Library Manager orqali o'rnating):
 *   - ArduinoJson (by Benoit Blanchon, v6 yoki v7)
 *   - Adafruit AHTX0 (+ Adafruit Unified Sensor)
 *   - SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   - ESP32Servo
 **********************************************************************/

#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Adafruit_AHTX0.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <ESP32Servo.h>

// ========================= DEFAULT SOZLAMALAR =========================
#define DEFAULT_WIFI_SSID    "cail"
#define DEFAULT_WIFI_PASS    "12345678"
#define DEFAULT_DEVICE_ID    "box1"
#define DEFAULT_PAIRING_TOKEN "08dc27abf93e4ce08418a89f86396647"

#define API_HOST             "nurse-ai.onrender.com"
#define API_PORT             443
#define API_PATH             "/api/public/device/vitals"
#define CLOUD_PERIOD_MS      1000

// ---- Pinlar ----
#define PIN_BUZZER           33
#define PIN_LIQUID           25
#define PIN_HEATER_RELAY     18
#define PIN_ANTISEPTIC       19
#define PIN_SERVO            13
#define PIN_NTC              34
#define PIN_SDA              21
#define PIN_SCL              22

// ---- NTC Parametrlari ----
#define NTC_R_SERIES         10000.0f
#define NTC_R_NOMINAL        10000.0f
#define NTC_T_NOMINAL        25.0f
#define NTC_BETA             3950.0f
#define ADC_MAX              4095.0f

#define LIQUID_PRESENT_LEVEL LOW
#define SERVO_IDLE_DEG       0
#define SERVO_RUN_DEG        90

// ========================= GLOBAL HOZIRGI HOLAT =========================
Preferences preferences;

String wifi_ssid     = DEFAULT_WIFI_SSID;
String wifi_pass     = DEFAULT_WIFI_PASS;
String device_id     = DEFAULT_DEVICE_ID;
String pairing_token = DEFAULT_PAIRING_TOKEN;

Adafruit_AHTX0 aht;
MAX30105        maxSensor;
Servo             antisepticServo;

SemaphoreHandle_t i2cMutex;
SemaphoreHandle_t stateMutex;

struct Vitals {
  float bpm        = 0;
  float spo2       = 0;
  float airTemp    = 0;
  float humidity   = 0;
  float waterTemp  = 0;
  bool  liquidEmpty = false;
} vitals;

volatile bool  alertsArmed         = false;
volatile bool  antisepticRunning   = false;
volatile int   antisepticDurationS = 15;
volatile float heaterOnC           = 22.0f;
volatile float heaterOffC          = 24.0f;
volatile bool  wifiReady           = false;

TaskHandle_t   cloudTaskHandle     = NULL;
unsigned long  antisepticStartedMs = 0;
bool           maxSensorOk         = false;
bool           ahtOk               = false;

// ========================= YORDAMCHI FUNKSIYALAR =========================
inline void beep(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

float readNtcTempC() {
  uint32_t acc = 0;
  for (int i = 0; i < 16; i++) { acc += analogRead(PIN_NTC); delay(1); }
  float val = acc / 16.0f;
  val = constrain(val, 1.0f, 4094.0f);
  float r2 = NTC_R_SERIES * (ADC_MAX - val) / val;
  float tK = 1.0f / (1.0f / (NTC_T_NOMINAL + 273.15f)
             + (1.0f / NTC_BETA) * logf(r2 / NTC_R_NOMINAL));
  return tK - 273.15f;
}

void startAntiseptic(int durationS) {
  if (durationS < 1) durationS = 1;
  if (durationS > 600) durationS = 600;
  antisepticDurationS = durationS;
  digitalWrite(PIN_ANTISEPTIC, HIGH);
  antisepticServo.write(SERVO_RUN_DEG);
  antisepticRunning = true;
  antisepticStartedMs = millis();
  Serial.printf("[ANTISEPTIK] Ishga tushdi: %d s\n", durationS);
}

void stopAntiseptic() {
  digitalWrite(PIN_ANTISEPTIC, LOW);
  antisepticServo.write(SERVO_IDLE_DEG);
  antisepticRunning = false;
}

void updateAntiseptic() {
  if (antisepticRunning &&
      millis() - antisepticStartedMs >= (unsigned long)antisepticDurationS * 1000UL) {
    stopAntiseptic();
    Serial.println("[ANTISEPTIK] Ish yakunlandi");
  }
}

// ========================= PREFERENCES (FLASH SAQLASH) =========================
void loadConfig() {
  preferences.begin("ai_nurse", false);
  wifi_ssid     = preferences.getString("ssid", DEFAULT_WIFI_SSID);
  wifi_pass     = preferences.getString("pass", DEFAULT_WIFI_PASS);
  device_id     = preferences.getString("dev_id", DEFAULT_DEVICE_ID);
  pairing_token = preferences.getString("token", DEFAULT_PAIRING_TOKEN);
  preferences.end();
  Serial.println("[CONFIG] Xotiradan yuklandi:");
  Serial.printf("  SSID: %s\n  DevID: %s\n  Token: %s\n", wifi_ssid.c_str(), device_id.c_str(), pairing_token.c_str());
}

void saveConfig(String newSsid, String newPass, String newDevId, String newToken) {
  preferences.begin("ai_nurse", false);
  if (newSsid.length() > 0)   preferences.putString("ssid", newSsid);
  if (newPass.length() > 0)   preferences.putString("pass", newPass);
  if (newDevId.length() > 0)  preferences.putString("dev_id", newDevId);
  if (newToken.length() > 0)  preferences.putString("token", newToken);
  preferences.end();
  Serial.println("[CONFIG] Yangi sozlamalar NVS xotiraga saqlandi!");
}

// ========================= WEB SERIAL (USB ORQALI SOZLASH) =========================
void handleSerialCommands() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.startsWith("{") && input.endsWith("}")) {
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, input);
      if (!err) {
        String cmd = doc["cmd"] | "";
        if (cmd == "set_config") {
          String s = doc["ssid"] | "";
          String p = doc["pass"] | "";
          String d = doc["device_id"] | "";
          String t = doc["token"] | "";
          saveConfig(s, p, d, t);
          Serial.println("{\"status\":\"ok\",\"message\":\"Sozlamalar saqlandi. Qayta ishga tushmoqda...\"}");
          delay(500);
          ESP.restart();
        } else if (cmd == "get_info") {
          StaticJsonDocument<256> resp;
          resp["status"] = "ok";
          resp["device_id"] = device_id;
          resp["ssid"] = wifi_ssid;
          resp["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
          resp["ip"] = WiFi.localIP().toString();
          String out;
          serializeJson(resp, out);
          Serial.println(out);
        }
      }
    }
  }
}

// ========================= WIFI =========================
void wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());
  Serial.printf("[WIFI] Ulanmoqda: %s", wifi_ssid.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(300);
    Serial.print(".");
    handleSerialCommands();
  }
  wifiReady = (WiFi.status() == WL_CONNECTED);
  if (wifiReady) {
    Serial.print("  OK! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("  XATO (Ulana olmadi)");
  }
}

// ========================= CLOUD POST =========================
bool cloudPostOnce() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiReady = false;
    return false;
  }
  wifiReady = true;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + API_HOST + API_PATH;
  if (!http.begin(client, url)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", device_id);
  http.addHeader("x-device-token", pairing_token);
  http.setTimeout(3000);
  http.setReuse(true);

  Vitals v;
  if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(150)) == pdTRUE) {
    v = vitals;
    xSemaphoreGive(stateMutex);
  }

  StaticJsonDocument<512> doc;
  if (v.bpm > 0)       doc["bpm"]       = (int)v.bpm;
  if (v.spo2 > 0)      doc["spo2"]      = (int)v.spo2;
  if (v.airTemp != 0)  doc["air_temp"]  = v.airTemp;
  if (v.humidity != 0) doc["humidity"]  = v.humidity;
  if (v.waterTemp > 0) doc["water_temp"] = v.waterTemp;
  doc["liquid_empty"] = v.liquidEmpty;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  bool ok = (code == 200);
  if (ok) {
    String resp = http.getString();
    StaticJsonDocument<512> rdoc;
    DeserializationError err = deserializeJson(rdoc, resp);
    if (!err) {
      if (rdoc["start_antiseptic"] == true && !antisepticRunning) {
        int d = rdoc["antiseptic_duration_s"] | (int)antisepticDurationS;
        startAntiseptic(d);
      }
      if (rdoc.containsKey("antiseptic_duration_s") && !antisepticRunning)
        antisepticDurationS = rdoc["antiseptic_duration_s"] | (int)antisepticDurationS;
      if (rdoc.containsKey("heater_on_c"))  heaterOnC  = rdoc["heater_on_c"]  | (float)heaterOnC;
      if (rdoc.containsKey("heater_off_c")) heaterOffC = rdoc["heater_off_c"] | (float)heaterOffC;
      if (rdoc.containsKey("alerts_armed")) alertsArmed = rdoc["alerts_armed"].as<bool>();
    }
  } else {
    Serial.printf("[CLOUD] POST xatosi: %d\n", code);
  }
  http.end();
  return ok;
}

void cloudTask(void *pv) {
  unsigned long lastPost = 0;
  for (;;) {
    if (wifiReady && millis() - lastPost >= CLOUD_PERIOD_MS) {
      lastPost = millis();
      cloudPostOnce();
    } else if (!wifiReady && millis() - lastPost >= 10000) {
      lastPost = millis();
      wifiConnect();
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// ========================= SENSORLAR =========================
#define HR_BUFFER_LEN 100

void sensorTask(void *pv) {
  uint32_t irBuf[HR_BUFFER_LEN];
  uint32_t redBuf[HR_BUFFER_LEN];
  int32_t  spo2, hr; int8_t spo2Ok, hrOk;
  bool fingerLast = false;
  unsigned long lastMaxRetry = 0;

  for (;;) {
    if (!maxSensorOk && millis() - lastMaxRetry > 4000) {
      lastMaxRetry = millis();
      if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        maxSensorOk = maxSensor.begin(Wire, I2C_SPEED_FAST);
        if (maxSensorOk) {
          maxSensor.setup(60, 4, 2, 100, 411, 4096);
          Serial.println("[MAX30105] Ulanganligi aniqlandi va ishga tushdi!");
        }
        xSemaphoreGive(i2cMutex);
      }
    }

    if (maxSensorOk) {
      if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        bool finger = maxSensor.getIR() > 50000;
        if (finger) {
          for (int i = 0; i < HR_BUFFER_LEN; i++) {
            while (maxSensor.available() == false) maxSensor.check();
            redBuf[i] = maxSensor.getRed();
            irBuf[i]  = maxSensor.getIR();
            maxSensor.nextSample();
          }
          maxim_heart_rate_and_oxygen_saturation(
            irBuf, HR_BUFFER_LEN, redBuf,
            &spo2, &spo2Ok, &hr, &hrOk);
          xSemaphoreGive(i2cMutex);
          if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(150)) == pdTRUE) {
            if (hrOk && hr > 30 && hr < 220)        vitals.bpm  = hr;
            if (spo2Ok && spo2 > 70 && spo2 <= 100) vitals.spo2 = spo2;
            xSemaphoreGive(stateMutex);
          }
          fingerLast = true;
        } else {
          maxSensor.nextSample();
          xSemaphoreGive(i2cMutex);
          if (fingerLast) {
            if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
              vitals.bpm = 0; vitals.spo2 = 0;
              xSemaphoreGive(stateMutex);
            }
            fingerLast = false;
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(40));
  }
}

void envTask(void *pv) {
  unsigned long lastAhtRetry = 0;
  for (;;) {
    // --- AHT10 ---
    if (!ahtOk && millis() - lastAhtRetry > 4000) {
      lastAhtRetry = millis();
      if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        ahtOk = aht.begin(&Wire);
        if (ahtOk) Serial.println("[AHT10] Ulanganligi aniqlandi va ishga tushdi!");
        xSemaphoreGive(i2cMutex);
      }
    }

    if (ahtOk && xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
      sensors_event_t t, h;
      aht.getEvent(&t, &h);
      xSemaphoreGive(i2cMutex);
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(150)) == pdTRUE) {
        vitals.airTemp  = t.temperature;
        vitals.humidity = h.relative_humidity;
        xSemaphoreGive(stateMutex);
      }
    }

    // --- NTC suv harorati ---
    float wt = readNtcTempC();
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      vitals.waterTemp = wt;
      xSemaphoreGive(stateMutex);
    }

    // --- Isitgich ---
    if (wt < heaterOnC)       digitalWrite(PIN_HEATER_RELAY, HIGH);
    else if (wt > heaterOffC) digitalWrite(PIN_HEATER_RELAY, LOW);

    // --- Suyuqlik datchigi (XKC-Y28, PIN 25) ---
    int rawLiquid = digitalRead(PIN_LIQUID);
    bool present = (rawLiquid == LIQUID_PRESENT_LEVEL);
    bool empty = !present;

    static int lastRaw = -1;
    if (rawLiquid != lastRaw) {
      lastRaw = rawLiquid;
      Serial.printf("[LIQUID] Sensor PIN 25: %d -> Suyuqlik: %s\n", 
                    rawLiquid, present ? "BOR (Normal)" : "TUGADI (Signal!)");
    }

    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      vitals.liquidEmpty = empty;
      xSemaphoreGive(stateMutex);
    }

    if (empty) {
      antisepticServo.write(SERVO_RUN_DEG);
      beep(150); delay(120); beep(150);
    } else {
      if (!antisepticRunning) antisepticServo.write(SERVO_IDLE_DEG);
    }

    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

// ========================= SETUP =========================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n--- AI NURSE CABIN FIRMWARE (v4) ---");

  pinMode(PIN_BUZZER, OUTPUT);       digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_HEATER_RELAY, OUTPUT); digitalWrite(PIN_HEATER_RELAY, LOW);
  pinMode(PIN_ANTISEPTIC, OUTPUT);   digitalWrite(PIN_ANTISEPTIC, LOW);
  pinMode(PIN_LIQUID, INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  i2cMutex   = xSemaphoreCreateMutex();
  stateMutex = xSemaphoreCreateMutex();

  // Sozlamalarni xotiradan yuklash
  loadConfig();

  // Servo
  antisepticServo.setPeriodHertz(50);
  antisepticServo.attach(PIN_SERVO, 500, 2400);
  antisepticServo.write(SERVO_IDLE_DEG);

  // AHT10
  ahtOk = aht.begin(&Wire);
  Serial.println(ahtOk ? "[AHT10] Tayyor" : "[AHT10] Topilmadi");

  // MAX30105
  maxSensorOk = maxSensor.begin(Wire, I2C_SPEED_FAST);
  if (maxSensorOk) {
    maxSensor.setup(60, 4, 2, 100, 411, 4096);
    Serial.println("[MAX30105] Tayyor");
  } else Serial.println("[MAX30105] Topilmadi");

  // Wi-Fi ulanish
  wifiConnect();

  // FreeRTOS Tasklar
  xTaskCreatePinnedToCore(sensorTask, "sensors", 8192, NULL, 3, NULL, 1);
  xTaskCreatePinnedToCore(envTask,    "env",     6144, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(cloudTask,  "cloud",   8192, NULL, 2, &cloudTaskHandle, 0);

  beep(80); delay(60); beep(80);
}

void loop() {
  updateAntiseptic();
  handleSerialCommands(); // USB orqali keladigan buyruqlarni doimiy eshitib turish
  delay(20);
}
