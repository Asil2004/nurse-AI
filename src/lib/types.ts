export type Vitals = {
  bpm: number;
  spo2: number;
  systolic: number;
  diastolic: number;
  bpPulse?: number;
  airTemp: number;
  humidity: number;
  updatedAt: string;
};

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  condition: string;
  device_id: string | null;
  prescriptions: string;
  nurse_notes: string;
  auto_mode: boolean;
  current_vitals: Vitals;
  assigned_nurse_id: string | null;
};

export function defaultVitals(): Vitals {
  return { bpm: 72, spo2: 98, systolic: 120, diastolic: 78, bpPulse: 72, airTemp: 23, humidity: 45, updatedAt: new Date().toISOString() };
}

export function simulateVitals(prev: Vitals): Vitals {
  const j = (v: number, r: number) => Math.max(0, v + (Math.random() - 0.5) * r);
  return {
    bpm: prev.bpm > 0 ? Math.round(j(prev.bpm, 4)) : 0,
    spo2: prev.spo2 > 0 ? Math.min(100, Math.round(j(prev.spo2, 1))) : 0,
    // Qon bosimi va Rossmax pulsi faqat haqiqiy o'lchovda o'zgaradi, simulyatsiyada soxtalashtirilmaydi!
    systolic: prev.systolic || 0,
    diastolic: prev.diastolic || 0,
    bpPulse: prev.bpPulse || prev.bpm || 0,
    airTemp: prev.airTemp ? Number(j(prev.airTemp, 0.4).toFixed(1)) : 0,
    humidity: prev.humidity ? Number(j(prev.humidity, 1).toFixed(1)) : 0,
    updatedAt: new Date().toISOString(),
  };
}
