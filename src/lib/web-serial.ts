// Web Serial API orqali ESP32 ga Wi-Fi va Token yozish
export interface Esp32Config {
  ssid: string;
  pass: string;
  deviceId: string;
  token: string;
}

export async function flashConfigToEsp32(config: Esp32Config, onProgress?: (msg: string) => void): Promise<boolean> {
  if (!("serial" in navigator)) {
    throw new Error("Sizning brauzeringiz Web Serial'ni qo'llab-quvvatlamaydi (Google Chrome yoki Edge ishlatish tavsiya etiladi)");
  }

  onProgress?.("USB portni tanlang...");
  const port = await (navigator as any).serial.requestPort();

  onProgress?.("Port ochilmoqda (115200 baud)...");
  await port.open({ baudRate: 115200 });

  try {
    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();

    onProgress?.("Buyruq yuborilmoqda...");
    const payload = JSON.stringify({
      cmd: "set_config",
      ssid: config.ssid,
      pass: config.pass,
      device_id: config.deviceId,
      token: config.token,
    }) + "\n";

    await writer.write(encoder.encode(payload));
    writer.releaseLock();

    onProgress?.("Sozlamalar ESP32 ga yozildi! Qurilma qayta ishga tushmoqda...");
    await new Promise((r) => setTimeout(r, 1000));
    return true;
  } finally {
    try {
      await port.close();
    } catch {}
  }
}
