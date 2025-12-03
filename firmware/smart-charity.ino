#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Pin TCS3200 pada ESP32
#define S2 2
#define S3 15
#define OUT 4

// Inisialisasi LCD I2C (alamat 0x27, 16 kolom, 2 baris)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Konfigurasi WiFi
const char* ssid = "Knyazeva";         // Ganti dengan nama WiFi Anda
const char* password = "takonzura";  // Ganti dengan password WiFi Anda

// URL server (ganti dengan IP komputer Anda)
const char* serverURL = "http://192.168.100.117:3000/api/donation"; // Ganti IP sesuai komputer Anda
const char* lcdMessageURL = "http://192.168.100.117:3000/api/lcd-message"; // URL untuk mengambil pesan LCD

// Variabel warna
int Red = 0, Green = 0, Blue = 0;
int statusUang = 0;
int msg = 0;

// Variabel untuk mencegah deteksi berulang
bool uangSedangTerdeteksi = false;
int nominalTerakhir = 0;
unsigned long waktuDeteksiTerakhir = 0;
const unsigned long DEBOUNCE_TIME = 3000; // 3 detik debounce
const unsigned long TIMEOUT_DETECTION = 5000; // 5 detik timeout untuk reset state

// Variabel untuk pesan LCD
String currentLcdLine1 = "Sedekah membawa";
String currentLcdLine2 = "berkah";
unsigned long lastMessageCheck = 0;
const unsigned long MESSAGE_CHECK_INTERVAL = 5000; // Check pesan setiap 5 detik

// RGB range untuk setiap nominal (bisa disesuaikan dengan kalibrasi)
struct RGBRange {
  int rMin, rMax, gMin, gMax, bMin, bMax;
};

RGBRange range50k = {23, 27, 20, 24, 16, 20};
RGBRange range100k = {18, 22, 24, 28, 21, 24};

// Variabel untuk WiFi dan HTTP
WiFiClient client;
HTTPClient http;

// Fungsi untuk membaca frekuensi warna dari sensor
int readColor(int s2_val, int s3_val) {
  digitalWrite(S2, s2_val);
  digitalWrite(S3, s3_val);
  delay(50);
  return pulseIn(OUT, LOW);
}

// Fungsi untuk membaca warna RGB
void readRGB() {
  Red = readColor(LOW, LOW);    // Red
  Green = readColor(HIGH, HIGH); // Green
  Blue = readColor(LOW, HIGH);   // Blue
}

// Fungsi deteksi nominal dengan range RGB
bool detectNominal(int nominal, RGBRange range) {
  return (Red >= range.rMin && Red <= range.rMax) &&
         (Green >= range.gMin && Green <= range.gMax) &&
         (Blue >= range.bMin && Blue <= range.bMax);
}

// Fungsi untuk cek apakah masih dalam range RGB yang sama
bool isInSameRGBRange(int nominal) {
  if (nominal == 50000) {
    return detectNominal(50000, range50k);
  } else if (nominal == 100000) {
    return detectNominal(100000, range100k);
  }
  return false;
}

// Fungsi untuk menampilkan ke LCD
void displayLCD(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16)); // Batasi maksimal 16 karakter
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16)); // Batasi maksimal 16 karakter
}

// Fungsi untuk mengirim data ke server
bool sendToServer(int nominal) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi tidak terhubung!");
    return false;
  }

  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");

  // Buat JSON payload
  StaticJsonDocument<200> doc;
  doc["nominal"] = nominal;
  doc["deviceId"] = "smart_charity_box_01";

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("Mengirim data: " + jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    http.end();
    return true;
  } else {
    Serial.print("Error mengirim data: ");
    Serial.println(httpResponseCode);
    http.end();
    return false;
  }
}

// Fungsi untuk koneksi WiFi
void connectToWiFi() {
  WiFi.begin(ssid, password);
  displayLCD("Connecting WiFi", "Please wait...");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected! IP: ");
    Serial.println(WiFi.localIP());
    displayLCD("WiFi Connected", WiFi.localIP().toString());
    delay(2000);
  } else {
    Serial.println();
    Serial.println("Failed to connect to WiFi!");
    displayLCD("WiFi Failed", "Check settings");
    delay(2000);
  }
}

// Fungsi proses jika uang terdeteksi (hanya sekali per deteksi)
void processNominal(int nominal) {
  // Set state bahwa uang sedang terdeteksi
  uangSedangTerdeteksi = true;
  nominalTerakhir = nominal;
  waktuDeteksiTerakhir = millis();
  
  statusUang = nominal;
  msg = 1;
  
  Serial.print("Uang terdeteksi: Rp ");
  Serial.println(nominal);
  
  // Tampilkan ke LCD
  String line1 = "Terdeteksi:";
  String line2 = "Rp " + String(nominal);
  displayLCD(line1, line2);
  
  delay(1000);
  
  // Kirim ke server
  displayLCD("Sending data", "Please wait...");
  bool success = sendToServer(nominal);
  
  if (success) {
    displayLCD("Data sent!", "Thank you :)");
    Serial.println("Data berhasil dikirim ke server!");
  } else {
    displayLCD("Send failed", "Check connection");
    Serial.println("Gagal mengirim data ke server!");
  }
  
  delay(3000); // Tampilkan hasil selama 3 detik
}

// Fungsi untuk mengambil pesan LCD dari server
bool fetchLCDMessage() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi tidak terhubung untuk ambil pesan LCD");
    return false;
  }

  HTTPClient http;
  http.begin(lcdMessageURL);
  http.setTimeout(5000); // Timeout 5 detik
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("Response LCD message: " + payload);
    
    // Parse JSON response
    StaticJsonDocument<300> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (error) {
      Serial.println("Gagal parsing JSON untuk pesan LCD");
      http.end();
      return false;
    }
    
    // Ambil pesan dari struktur JSON yang benar
    if (doc["success"] == true && doc.containsKey("message")) {
      JsonObject messageObj = doc["message"];
      
      String newLine1 = messageObj["line1"].as<String>();
      String newLine2 = messageObj["line2"].as<String>();
      
      // Update pesan LCD jika ada perubahan
      if (newLine1 != currentLcdLine1 || newLine2 != currentLcdLine2) {
        currentLcdLine1 = newLine1;
        currentLcdLine2 = newLine2;
        
        Serial.println("Pesan LCD diperbarui:");
        Serial.println("Line 1: " + currentLcdLine1);
        Serial.println("Line 2: " + currentLcdLine2);
        
        http.end();
        return true; // Ada perubahan pesan
      }
    }
    
    http.end();
    return false; // Tidak ada perubahan
  } else {
    Serial.println("Gagal mengambil pesan LCD, HTTP code: " + String(httpCode));
    http.end();
    return false;
  }
}

void setup() {
  pinMode(S2, OUTPUT);
  pinMode(S3, OUTPUT);
  pinMode(OUT, INPUT);

  Serial.begin(115200);
  
  // Inisialisasi LCD
  lcd.init();
  lcd.backlight();
  
  // Tampilan awal
  displayLCD("Smart Charity", "Box Starting...");
  delay(2000);
  
  // Koneksi WiFi
  connectToWiFi();
  
  // Tampilan siap
  displayLCD("System Ready", "Waiting...");
  delay(2000);
  
  // Reset state detection
  uangSedangTerdeteksi = false;
  nominalTerakhir = 0;
  waktuDeteksiTerakhir = 0;
  
  // Ambil pesan LCD awal dari server
  fetchLCDMessage();
  displayLCD(currentLcdLine1, currentLcdLine2);
}

void loop() {
  // Cek koneksi WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi terputus, mencoba reconnect...");
    connectToWiFi();
  }

  readRGB();
  Serial.print("RGB: ");
  Serial.print(Red); Serial.print(", ");
  Serial.print(Green); Serial.print(", ");
  Serial.println(Blue);

  unsigned long currentTime = millis();
  
  // Reset state jika sudah timeout (uang sudah diambil)
  if (uangSedangTerdeteksi && (currentTime - waktuDeteksiTerakhir > TIMEOUT_DETECTION)) {
    if (!isInSameRGBRange(nominalTerakhir)) {
      Serial.println("Timeout detection - Reset state");
      uangSedangTerdeteksi = false;
      nominalTerakhir = 0;
    } else {
      // Update waktu jika masih dalam range yang sama
      waktuDeteksiTerakhir = currentTime;
    }
  }

  bool uangTerdeteksi = false;
  int nominalDetected = 0;

  // Deteksi nominal berdasarkan nilai RGB
  if (detectNominal(50000, range50k)) {
    uangTerdeteksi = true;
    nominalDetected = 50000;
  } else if (detectNominal(100000, range100k)) {
    uangTerdeteksi = true;
    nominalDetected = 100000;
  }

  if (uangTerdeteksi) {
    // Cek apakah ini deteksi baru atau masih uang yang sama
    if (!uangSedangTerdeteksi) {
      // Deteksi baru - proses uang
      Serial.println("Deteksi uang baru!");
      processNominal(nominalDetected);
    } else if (nominalDetected != nominalTerakhir) {
      // Nominal berbeda terdeteksi - proses sebagai uang baru
      Serial.println("Deteksi nominal berbeda!");
      processNominal(nominalDetected);
    } else {
      // Masih uang yang sama - tidak proses ulang
      Serial.println("Masih uang yang sama - skip");
      waktuDeteksiTerakhir = currentTime; // Update waktu terakhir
    }
  } else {
    // Tidak ada uang terdeteksi
    if (Red > 100 && Green > 100 && Blue > 100) {
      // Reset state jika tidak ada deteksi dalam debounce time
      if (uangSedangTerdeteksi && (currentTime - waktuDeteksiTerakhir > DEBOUNCE_TIME)) {
        Serial.println("Debounce time passed - Reset state");
        uangSedangTerdeteksi = false;
        nominalTerakhir = 0;
      }
      
      statusUang = 0;
      msg = 0;
    } else {
      Serial.println("Sensor tidak aktif atau warna tidak cocok");
    }
  }

  // Cek dan update pesan LCD dari server secara berkala
  if (currentTime - lastMessageCheck >= MESSAGE_CHECK_INTERVAL && !uangSedangTerdeteksi) {
    Serial.println("Checking for LCD message updates...");
    
    bool messageUpdated = fetchLCDMessage();
    
    if (messageUpdated) {
      // Tampilkan pesan baru ke LCD
      displayLCD(currentLcdLine1, currentLcdLine2);
      Serial.println("LCD message updated and displayed");
    } else {
      // Jika tidak ada update dan tidak sedang proses uang, tampilkan pesan saat ini
      static unsigned long lastDisplayUpdate = 0;
      if (currentTime - lastDisplayUpdate >= 10000) { // Update display setiap 10 detik
        String statusSuffix = (WiFi.status() == WL_CONNECTED) ? " Online" : " Offline";
        
        // Jika pesan default, tampilkan dengan status
        if (currentLcdLine1 == "Sedekah membawa" && currentLcdLine2 == "berkah") {
          displayLCD(currentLcdLine1, currentLcdLine2 + statusSuffix.substring(0, 16 - currentLcdLine2.length()));
        } else {
          displayLCD(currentLcdLine1, currentLcdLine2);
        }
        lastDisplayUpdate = currentTime;
      }
    }
    
    lastMessageCheck = currentTime;
  }

  delay(500); // Reduce delay untuk responsivitas yang lebih baik
}