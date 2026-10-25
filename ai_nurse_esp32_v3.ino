/**********************************************************************
 *  AI NURSE — ESP32 SMART CABIN FIRMWARE  (v3, to'liq .ino)
 *  Board: ESP32 Dev Module  |  Arduino IDE (ESP32 core 2.x/3.x)
 *
 *  Xususiyatlar:
 *   • MAX30105  → BPM + SpO2 (real-time, spo2_algorithm)
 *   • AHT10     → havo harorati + namlik (I2C 0x38)
 *   • XKC-Y28   → suyuqlik sensori (PIN 25) + servo valve (PIN 13)
 *   • NTC 10K   → suv harorati (PIN 34) + isitgich relyeli (PIN 18, hysterezis)
 *   • Antiseptik relyeli (PIN 19) — web buyruq yoki tugma (PIN 32)
 *   • Buzzer (PIN 33) — faqat alerts_armed = true bo'lganda suyuqlik
 *     tugaganda doimiy chalinadi (web sayt bilan sinxron)
 *   • OLED SSD1306 status ekrani
 *   • Web sinxron: har 2 sekundda POST → javobda buyruqlar qaytadi
 *   • "Ping-Pong" qon bosimi: web'dan measure_bp=true kelganda
 *     Wi-Fi O'CHADI → BLE orqali Rossmax Z5 tonometr ulanadi →
 *     natija o'lchanadi → Wi-Fi qayta YOQILIB natija web'ga yuboriladi
 *
 *  KUTUBXONALAR (Library Manager):
 *   - ArduinoJson (benoitblanchon)
 *   - Adafruit AHTX0 (+ Adafruit Unified Sensor)
 *   - SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   - Adafruit SSD1306 + Adafruit GFX
 *   - ESP32Servo
 *   - BLE (ESP32 core ichida)
 *   - WiFiClientSecure / HTTPClient (ESP32 core ichida)
 *
 *  MUHIM: PAIRING_TOKEN Admin panelidagi qurilma tokeni bilan
 *  AYNAN bir xil bo'lishi kerak (bo'sh joy / katta-kichik harf).
 **********************************************************************/

#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_MAX30105.h>
#include "spo2_algorithm.h"
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLE2902.h>

// ========================= CONFIG =========================
#define WIFI_SSID        "wifi"
#define WIFI_PASS        "11111111"
#define API_HOST         "smart-cabin-health-hub.lovable.app"
#define API_PORT         443
#define API_PATH         "/api/public/device/vitals"
#define DEVICE_ID        "AIN-001"
#define PAIRING_TOKEN    "TOKEN_BU_YERGA"   // <-- Admin paneldan olingan token

#define CLOUD_PERIOD_MS  2000               // web'ga yuborish davri
#define BP_TIMEOUT_MS    120000             // BLE tonometr kutish (120 s)

// ---- Pinlar ----
#define PIN_BUZZER       33
#define PIN_LIQUID       25                 // XKC-Y28 digital out
#define PIN_HEATER_RELAY 18
#define PIN_ANTISEPTIC   19
#define PIN_BUTTON       32                 // antiseptik fizik tugma
#define PIN_SERVO        13
#define PIN_NTC          34                 // ADC (NTC 10K)
#define PIN_SDA          21
#define PIN_SCL          22

// ---- NTC (Steinhart-Hart) ----
#define NTC_R_SERIES     10000.0f           // 10K pull-down qarshilik
#define NTC_R_NOMINAL    10000.0f           // 25°C da NTC qarshiligi
#define NTC_T_NOMINAL    25.0f
#define NTC_BETA         3950.0f
#define ADC_MAX          4095.0f

// ---- XKC-Y28: suyuq bor bo'lsa sensor chiqishi qaysi daraja? ----
// Ko'p modullarda suyuqlik mavjudligida LOW chiqadi.
// Agar sizkinida teskari bo'lsa true/false ni almashtiring.
#define LIQUID_PRESENT_LEVEL  LOW

// ---- OLED ----
#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_ADDR        0x3C

// ---- Antiseptik servo ----
#define SERVO_IDLE_DEG   0
#define SERVO_RUN_DEG    90

// ========================= GLOBAL STATE =========================
Adafruit_AHTX0      aht;
Adafruit_MAX30105   maxSensor;
Adafruit_SSD1306    oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Servo               antisepticServo;

SemaphoreHandle_t   i2cMutex;      // AHT10 + OLED + MAX30105 umumiy I2C
SemaphoreHandle_t   stateMutex;    // vitals strukturasini himoya qilish

struct Vitals {
  float bpm        = 0;
  float spo2       = 0;
  int   systolic   = 0;
  int   diastolic  = 0;
  int   bpPulse    = 0;
  float airTemp    = 0;
  float humidity   = 0;
  float waterTemp  = 0;
  bool  liquidEmpty = false;
  bool  bpFresh    = false;    // yangi BLE BP natijasi yuborilishini kutmoqda
  unsigned long bpTime = 0;
} vitals;

// Web saytdan keladigan buyruqlar / sozlamalar
volatile bool  alertsArmed          = false;   // web: "Dori qabul qilish" → true
volatile bool  antisepticRunning    = false;
volatile int   antisepticDurationS  = 15;
volatile float heaterOnC            = 22.0f;
volatile float heaterOffC           = 24.0f;

volatile bool  wifiReady            = false;
volatile bool  bleMeasuring         = false;   // Ping-Pong: BLE rejimda

TaskHandle_t   cloudTaskHandle = NULL;
TaskHandle_t   bpTaskHandle    = NULL;

unsigned long  lastCloudOk         = 0;
unsigned long  antisepticStartedMs = 0;
bool           maxSensorOk         = false;
bool           ahtOk               = false;
bool           oledOk              = false;

// BLE natijalar (bpTask yozadi)
volatile int   bleSys = 0, bleDia = 0, blePulse = 0;
volatile bool  bleSysDone = false, bleDiaDone = false;
volatile bool  bleNotifySeen = false;

// ========================= HELPERS =========================
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
  float r2 = NTC_R_SERIES * (ADC_MAX - val) / val;   // pastki pull-up sxemasi
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
  Serial.printf("[ANTISEPTIK] ishga tushdi: %d s\n", durationS);
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
    Serial.println("[ANTISEPTIK] tugadi");
  }
  // Fizik tugma (PIN 32) — qisqa bosilsa antiseptik ishga tushadi
  static unsigned long lastBtn = 0;
  static bool btnPrev = HIGH;
  bool btnNow = digitalRead(PIN_BUTTON);
  if (btnPrev == HIGH && btnNow == LOW && millis() - lastBtn > 2000) {
    lastBtn = millis();
    startAntiseptic(antisepticDurationS);
  }
  btnPrev = btnNow;
}

// ========================= WIFI =========================
void wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WIFI] ulanmoqda: %s", WIFI_SSID);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(250);
    Serial.print(".");
  }
  wifiReady = (WiFi.status() == WL_CONNECTED);
  Serial.println(wifiReady ? "  OK" : "  ULANMADI");
}

void wifiOff() {
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  wifiReady = false;
  Serial.println("[WIFI] o'chirildi (BLE rejim)");
}

// ========================= CLOUD POST =========================
bool cloudPostOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();                       // sertifikat tekshiruvi yoqilmagan
  HTTPClient http;
  String url = String("https://") + API_HOST + API_PATH;
  if (!http.begin(client, url)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", PAIRING_TOKEN);
  http.setTimeout(8000);

  Vitals v;
  if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    v = vitals;
    // BP natijasi bir marta yuboriladi, keyin "eski" bo'lib qoladi
    if (v.bpFresh && millis() - v.bpTime > 30000) v.bpFresh = false;
    xSemaphoreGive(stateMutex);
  }

  StaticJsonDocument<512> doc;
  if (v.bpm > 0)       doc["bpm"]       = (int)v.bpm;
  if (v.spo2 > 0)      doc["spo2"]      = (int)v.spo2;
  if (v.bpFresh && v.systolic > 0)  doc["systolic"]  = v.systolic;
  if (v.bpFresh && v.diastolic > 0) doc["diastolic"] = v.diastolic;
  if (v.airTemp  != 0) doc["air_temp"]  = v.airTemp;
  if (v.humidity != 0) doc["humidity"]  = v.humidity;
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
      // --- Buyruqlar ---
      if (rdoc["measure_bp"] == true && !bleMeasuring && bpTaskHandle) {
        Serial.println("[CLOUD] measure_bp buyrug'i keldi → BLE rejim");
        xTaskNotifyGive(bpTaskHandle);
      }
      if (rdoc["start_antiseptic"] == true && !antisepticRunning) {
        int d = rdoc["antiseptic_duration_s"] | (int)antisepticDurationS;
        startAntiseptic(d);
      }
      // --- Sozlamalar ---
      if (rdoc.containsKey("antiseptic_duration_s") && !antisepticRunning)
        antisepticDurationS = rdoc["antiseptic_duration_s"] | (int)antisepticDurationS;
      if (rdoc.containsKey("heater_on_c"))  heaterOnC  = rdoc["heater_on_c"]  | (float)heaterOnC;
      if (rdoc.containsKey("heater_off_c")) heaterOffC = rdoc["heater_off_c"] | (float)heaterOffC;
      // --- alerts_armed: web sayt bilan buzzer sinxroni ---
      if (rdoc.containsKey("alerts_armed"))
        alertsArmed = rdoc["alerts_armed"].as<bool>();

      // BP bir marta yuborilgach "yangi" emas deb belgilaymiz
      if (v.bpFresh && xSemaphoreTake(stateMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        vitals.bpFresh = false;
        xSemaphoreGive(stateMutex);
      }
      lastCloudOk = millis();
    }
  } else {
    Serial.printf("[CLOUD] POST xato: %d\n", code);
  }
  http.end();
  return ok;
}

void cloudTask(void *pv) {
  unsigned long lastPost = 0;
  for (;;) {
    // BLE o'lchov rejimida Wi-Fi yo'q — POST to'xtatiladi
    if (!bleMeasuring && wifiReady && millis() - lastPost >= CLOUD_PERIOD_MS) {
      lastPost = millis();
      cloudPostOnce();
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// ========================= BLE TONOMETR (Ping-Pong) =========================
// Rossmax Z5 (yoki boshqa BLE tonometr): standart Blood Pressure Service
// (0x1810) / Blood Pressure Measurement (0x2A35) ishlatiladi.
// Sizning qurilmangiz boshqa xarakteristikadan yuborsa,
// 6-qadamdagi (parseBleFrame) funksiyani o'zingiznikiga almashtiring.

// IEEE-11073 16-bit SFLOAT dekodlash
float decodeSfloat(uint16_t raw) {
  int exp  = (raw >> 12) & 0x0F; if (exp >= 8) exp -= 16;   // signed 4-bit
  int mant = raw & 0x0FFF;       if (mant >= 2048) mant -= 4096;
  return mant * powf(10.0f, exp);
}

void parseBleFrame(const uint8_t *data, size_t len) {
  // 1) Standart 0x2A35: flags(1) + systolic sfloat + diastolic + MAP
  if (len >= 7) {
    uint8_t flags = data[0];
    uint16_t sRaw = data[1] | (data[2] << 8);
    uint16_t dRaw = data[3] | (data[4] << 8);
    float s = decodeSfloat(sRaw), d = decodeSfloat(dRaw);
    if (s > 20 && s < 260 && d > 10 && d < 180) {
      bleSys = (int)s; bleDia = (int)d; bleSysDone = true; bleDiaDone = true;
      bleNotifySeen = true;
      return;
    }
  }
  // 2) ASCII format (ba'zi firmware'lar): "SYS:120 DIA:80 PUL:75"
  String txt; txt.reserve(len);
  for (size_t i = 0; i < len; i++) if (data[i] >= 32 && data[i] < 127) txt += (char)data[i];
  int si = txt.indexOf("SYS"), di = txt.indexOf("DIA"), pi = txt.indexOf("PUL");
  if (si >= 0) { bleSys = txt.substring(si + 3).toInt(); if (bleSys > 0) bleSysDone = true; }
  if (di >= 0) { bleDia = txt.substring(di + 3).toInt(); if (bleDia > 0) bleDiaDone = true; }
  if (pi >= 0) { blePulse = txt.substring(pi + 3).toInt(); }
  if (si >= 0 || di >= 0) bleNotifySeen = true;
}

class BpNotifyCb : public BLECharacteristicCallbacks {
  void onNotify(BLECharacteristic *c) override {
    size_t len = c->getLen();
    const uint8_t *d = c->getData();
    if (d && len) parseBleFrame(d, len);
  }
};

void bpTask(void *pv) {
  for (;;) {
    // "measure_bp" buyrug'ini cloudTask'dan kutish
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    bleMeasuring = true;
    bleSysDone = bleDiaDone = false; bleSys = bleDia = blePulse = 0;
    Serial.println("[BLE] Wi-Fi o'chiriladi, tonometr ulanmoqda...");
    wifiOff();
    delay(500);

    BLEDevice::init("AI-Nurse-Cabin");
    BLEScan *scan = BLEDevice::getScan();
    scan->setActiveScan(true);
    BLEScanResults res = scan->start(5, false);

    BLEAddress target("");
    bool found = false;
    for (int i = 0; i < res.getCount(); i++) {
      String name = res.getDevice(i).getName();
      if (name.length() && (name.indexOf("ROSSMAX") >= 0 || name.indexOf("Rossmax") >= 0)) {
        target = res.getDevice(i).getAddress(); found = true;
        Serial.printf("[BLE] tonometr topildi: %s (%s)\n", name.c_str(), target.toString().c_str());
        break;
      }
    }
    scan->clearResults();

    unsigned long t0 = millis();
    bool measured = false;
    if (found) {
      BLEClient *cli = BLEDevice::createClient();
      if (cli->connect(target)) {
        Serial.println("[BLE] ulandi — natija kutilmoqda...");
        BLERemoteService *svc = cli->getService(BLEUUID((uint16_t)0x1810));
        BLERemoteCharacteristic *ch = nullptr;
        if (svc) ch = svc->getCharacteristic(BLEUUID((uint16_t)0x2A35));
        if (!ch) {  // ayrim qurilmalar xizmat UUID'siz ochiq xarakteristika beradi
          BLERemoteService *svc2 = cli->getService(BLEUUID((uint16_t)0xFFF0));
          if (svc2) ch = svc2->getCharacteristic(BLEUUID((uint16_t)0xFFF1));
        }
        if (ch && ch->canNotify()) {
          ch->subscribe(true, new BpNotifyCb());
          // Ba'zi tonometrlar o'lchovni boshlash uchun yozuv kerak bo'lsa:
          // uint8_t startCmd[] = {0x01}; ch->writeValue(startCmd, 1, true);
        }
        while (millis() - t0 < BP_TIMEOUT_MS) {
          if (bleSysDone && bleDiaDone) { measured = true; break; }
          delay(200);
        }
        cli->disconnect();
      }
    }
    BLEDevice::deinit(false);
    delay(500);

    // Wi-Fi qayta yoqiladi
    wifiConnect();

    if (measured) {
      Serial.printf("[BLE] BP: %d/%d pulsi %d\n", bleSys, bleDia, blePulse);
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        vitals.systolic  = bleSys;
        vitals.diastolic = bleDia;
        if (blePulse > 0) vitals.bpPulse = blePulse;
        vitals.bpFresh = true;
        vitals.bpTime = millis();
        xSemaphoreGive(stateMutex);
      }
      beep(80); delay(60); beep(80);   // o'lchov tugadi signali
    } else {
      Serial.println("[BLE] natija olinmadi (timeout)");
    }
    bleMeasuring = false;   // cloudTask davom etadi
  }
}

// ========================= SENSORLAR =========================
// MAX30105: 4 sekundlik oynada BPM + SpO2 (SparkFun algoritmi)
#define HR_BUFFER_LEN 100     // 4 s * 25 Hz

void sensorTask(void *pv) {
  uint32_t irBuf[HR_BUFFER_LEN];
  uint32_t redBuf[HR_BUFFER_LEN];
  int32_t  spo2, hr; int8_t spo2Ok, hrOk;
  bool fingerLast = false;

  for (;;) {
    if (maxSensorOk) {
      if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(300)) == pdTRUE) {
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
          if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
            if (hrOk && hr > 30 && hr < 220)    vitals.bpm  = hr;
            if (spo2Ok && spo2 > 70 && spo2 <= 100) vitals.spo2 = spo2;
            xSemaphoreGive(stateMutex);
          }
          fingerLast = true;
        } else {
          maxSensor.nextSample();
          xSemaphoreGive(i2cMutex);
          if (fingerLast) {  // barmoq chiqib ketdi
            if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
              vitals.bpm = 0; vitals.spo2 = 0;
              xSemaphoreGive(stateMutex);
            }
            fingerLast = false;
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// AHT10 + NTC + isitgich + suyuqlik + servo/buzzer
void envTask(void *pv) {
  for (;;) {
    // --- AHT10 ---
    if (ahtOk && xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(300)) == pdTRUE) {
      sensors_event_t t, h;
      aht.getEvent(&t, &h);
      xSemaphoreGive(i2cMutex);
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
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
    // --- Isitgich (hysterezis) ---
    if (wt < heaterOnC)       digitalWrite(PIN_HEATER_RELAY, HIGH);
    else if (wt > heaterOffC) digitalWrite(PIN_HEATER_RELAY, LOW);

    // --- Suyuqlik XKC-Y28 ---
    bool present = (digitalRead(PIN_LIQUID) == LIQUID_PRESENT_LEVEL);
    bool empty = !present;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      vitals.liquidEmpty = empty;
      xSemaphoreGive(stateMutex);
    }
    if (empty) {
      // Qopqoq yopiladi (servo) + buzzer FAQAT web'da "Dori qabul qilish"
      // bosilgan bo'lsa (alerts_armed = true) chalinadi — web bilan sinxron.
      antisepticServo.write(SERVO_RUN_DEG);
      if (alertsArmed) { beep(150); delay(120); beep(150); }
    } else {
      if (!antisepticRunning) antisepticServo.write(SERVO_IDLE_DEG);
    }

    vTaskDelay(pdMS_TO_TICKS(600));
  }
}

// ========================= OLED =========================
void oledTask(void *pv) {
  for (;;) {
    if (oledOk && xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(300)) == pdTRUE) {
      Vitals v;
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(100)) == pdTRUE) { v = vitals; xSemaphoreGive(stateMutex); }
      oled.clearDisplay();
      oled.setTextSize(1);
      oled.setTextColor(SSD1306_WHITE);
      oled.setCursor(0, 0);
      if (bleMeasuring)            oled.println("BP BLE o'lchov...");
      else if (WiFi.status() == WL_CONNECTED) oled.println("WiFi OK | " + String(DEVICE_ID));
      else                         oled.println("WiFi YO'Q!");
      oled.setCursor(0, 14);
      oled.printf("BPM:%d SpO2:%d%%", (int)v.bpm, (int)v.spo2);
      oled.setCursor(0, 26);
      if (v.bpFresh && v.systolic) oled.printf("BP:%d/%d", v.systolic, v.diastolic);
      else                         oled.printf("BP: --/--");
      oled.setCursor(0, 38);
      oled.printf("Hava:%.1fC Nam:%.0f%%", v.airTemp, v.humidity);
      oled.setCursor(0, 50);
      oled.printf("Suv:%.1fC %s", v.waterTemp, v.liquidEmpty ? "TUGA!" : "OK");
      oled.display();
      xSemaphoreGive(i2cMutex);
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

// ========================= SETUP =========================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_BUZZER, OUTPUT);       digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_HEATER_RELAY, OUTPUT); digitalWrite(PIN_HEATER_RELAY, LOW);
  pinMode(PIN_ANTISEPTIC, OUTPUT);   digitalWrite(PIN_ANTISEPTIC, LOW);
  pinMode(PIN_LIQUID, INPUT_PULLUP);
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  i2cMutex   = xSemaphoreCreateMutex();
  stateMutex = xSemaphoreCreateMutex();

  // Servo
  antisepticServo.setPeriodHertz(50);
  antisepticServo.attach(PIN_SERVO, 500, 2400);
  antisepticServo.write(SERVO_IDLE_DEG);

  // OLED
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (oledOk) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0, 0);
    oled.println("AI Nurse v3");
    oled.println("Ishga tushmoqda...");
    oled.display();
  } else Serial.println("[OLED] topilmadi");

  // AHT10
  ahtOk = aht.begin(&Wire);
  Serial.println(ahtOk ? "[AHT10] OK" : "[AHT10] topilmadi");

  // MAX30105
  maxSensorOk = maxSensor.begin(Wire, I2C_SPEED_FAST);
  if (maxSensorOk) {
    maxSensor.setup(60, 4, 2, 100, 411, 4096);  // ledBrightness, avg, ledMode, rate, pulseW, adcRange
    Serial.println("[MAX30105] OK");
  } else Serial.println("[MAX30105] topilmadi");

  // Wi-Fi
  wifiConnect();

  // Tasklar
  xTaskCreatePinnedToCore(sensorTask, "sensors", 8192, NULL, 3, NULL, 1);
  xTaskCreatePinnedToCore(envTask,    "env",     6144, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(oledTask,   "oled",    4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(cloudTask,  "cloud",   10240, NULL, 2, &cloudTaskHandle, 0);
  xTaskCreatePinnedToCore(bpTask,     "bpble",   16384, NULL, 3, &bpTaskHandle, 0);
}

void loop() {
  updateAntiseptic();   // fizik tugma + antiseptik timer
  vTaskDelay(pdMS_TO_TICKS(50));
}
