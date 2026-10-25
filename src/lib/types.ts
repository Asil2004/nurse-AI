export type Vitals = {
  bpm: number;
  spo2: number;
  systolic: number;
  diastolic: number;
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
  return { bpm: 72, spo2: 98, systolic: 120, diastolic: 78, airTemp: 23, humidity: 45, updatedAt: new Date().toISOString() };
}

export function simulateVitals(prev: Vitals): Vitals {
  const j = (v: number, r: number) => Math.max(0, v + (Math.random() - 0.5) * r);
  return {
    bpm: Math.round(j(prev.bpm, 6)),
    spo2: Math.min(100, Math.round(j(prev.spo2, 1))),
    systolic: Math.round(j(prev.systolic, 5)),
    diastolic: Math.round(j(prev.diastolic, 4)),
    airTemp: Number(j(prev.airTemp, 0.6).toFixed(1)),
    humidity: Number(j(prev.humidity, 2).toFixed(1)),
    updatedAt: new Date().toISOString(),
  };
}
