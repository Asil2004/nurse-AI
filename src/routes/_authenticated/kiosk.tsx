import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { startAntisepticNow } from "@/lib/devices-bp.functions";
import { 
  Heart, 
  Wind, 
  Thermometer, 
  Droplet, 
  Sparkles, 
  Activity, 
  AlertTriangle,
  Bluetooth,
  Maximize,
  Minimize,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";

type KioskSearchParams = {
  patientId?: string;
  deviceId?: string;
};

export const Route = createFileRoute("/_authenticated/kiosk")({
  validateSearch: (search: Record<string, unknown>): KioskSearchParams => {
    return {
      patientId: search.patientId as string | undefined,
      deviceId: search.deviceId as string | undefined,
    };
  },
  head: () => ({ meta: [{ title: "AI Nurse — Palata Monitoring Ekrani" }] }),
  component: MedicalKioskPage,
});

function MedicalKioskPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [selectedDevice, setSelectedDevice] = useState<string>(search.deviceId || "box1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [antisepticLoading, setAntisepticLoading] = useState(false);
  const [bleReading, setBleReading] = useState<{ sys?: number; dia?: number; pul?: number } | null>(null);
  const [bleConnecting, setBleConnecting] = useState(false);

  // Qurilmalar ro'yxati
  const { data: devices } = useQuery({
    queryKey: ["kiosk-devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("*");
      return data ?? [];
    },
  });

  // Bemor ma'lumotlari (patientId bo'lsa ID bo'yicha, aks holda deviceId bo'yicha)
  const { data: currentPatient, refetch } = useQuery({
    queryKey: ["kiosk-patient", search.patientId, selectedDevice],
    queryFn: async () => {
      if (search.patientId) {
        const { data } = await supabase.from("patients").select("*").eq("id", search.patientId).maybeSingle();
        if (data?.device_id) setSelectedDevice(data.device_id);
        return data;
      } else {
        const { data } = await supabase.from("patients").select("*").eq("device_id", selectedDevice).maybeSingle();
        return data;
      }
    },
    refetchInterval: 1000,
  });

  // Realtime yangilanish
  useEffect(() => {
    const channel = supabase
      .channel("kiosk-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patients" },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const vitals = (currentPatient?.current_vitals as any) || {};

  const startAntisepticFn = useServerFn(startAntisepticNow);

  // Antiseptikni yoqish
  const handleStartAntiseptic = async () => {
    setAntisepticLoading(true);
    try {
      await startAntisepticFn({ data: { deviceId: selectedDevice } });
      toast.success("Antiseptik purkagich ishga tushirildi!");
    } catch (e: any) {
      toast.error(e.message || "Xatolik yuz berdi");
    } finally {
      setTimeout(() => setAntisepticLoading(false), 2000);
    }
  };

  // Fullscreen almashtirish
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Bemor profiliga qaytish
  const handleBackToPatient = () => {
    if (currentPatient?.id) {
      navigate({ to: `/patients/${currentPatient.id}` as any });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  // Rossmax Z5 Web Bluetooth
  const connectRossmax = async () => {
    if (!("bluetooth" in navigator)) {
      toast.error("Brauzeringiz Bluetooth'ni qo'llab-quvvatlamaydi (Google Chrome kerak)");
      return;
    }
    setBleConnecting(true);
    try {
      toast.info("Rossmax Z5 tonometrini yoqing...");
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: "ROSSMAX" },
          { namePrefix: "Rossmax" },
          { services: ["blood_pressure"] }
        ],
        optionalServices: ["blood_pressure", 0x1810, 0xFFF0]
      });

      const server = await device.gatt.connect();
      toast.success("Tonometr ulandi! O'lchov kutilmoqda...");
      
      const service = await server.getPrimaryService("blood_pressure").catch(async () => {
        return await server.getPrimaryService(0x1810);
      });
      const char = await service.getCharacteristic("blood_pressure_measurement").catch(async () => {
        return await service.getCharacteristic(0x2A35);
      });

      await char.startNotifications();
      char.addEventListener("characteristicvaluechanged", async (event: any) => {
        const val = event.target.value;
        const flags = val.getUint8(0);
        const sys = Math.round(val.getUint16(1, true));
        const dia = Math.round(val.getUint16(3, true));
        const pul = val.byteLength >= 16 ? Math.round(val.getUint16(14, true)) : 0;

        setBleReading({ sys, dia, pul });
        toast.success(`Qon bosimi: ${sys}/${dia} mmHg`);

        if (currentPatient?.id) {
          await supabase.from("patients").update({
            current_vitals: {
              ...vitals,
              systolic: sys,
              diastolic: dia,
              ...(pul > 0 ? { bpPulse: pul, bpm: pul } : {}),
              updatedAt: new Date().toISOString()
            }
          }).eq("id", currentPatient.id);

          await supabase.from("vitals").insert({
            patient_id: currentPatient.id,
            device_id: selectedDevice,
            systolic: sys,
            diastolic: dia,
            bpm: pul || null
          });
          refetch();
        }
      });
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        toast.error("Bluetooth xatosi: " + err.message);
      }
    } finally {
      setBleConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-800 p-4 sm:p-6 lg:p-8 flex flex-col justify-between select-none">
      {/* Yuqori Tibbiy Panel */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Ortga Bemor profiliga qaytish tugmasi */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToPatient}
            className="rounded-2xl border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold px-3 py-5 gap-2 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-sky-600" />
            <span>Ortga (Bemor profili)</span>
          </Button>

          <div className="h-10 w-px bg-slate-200 hidden sm:block mx-1"></div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">AI NURSE</h1>
              <span className="bg-sky-100 text-sky-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                PALATA MONITORI
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Kabina: <span className="font-semibold text-slate-700">{selectedDevice}</span>
              {currentPatient ? (
                <span className="ml-3 font-medium text-slate-700">
                  · Bemor: <b className="text-sky-700">{currentPatient.name}</b> ({currentPatient.age} yosh)
                </span>
              ) : (
                <span className="ml-3 text-slate-400 italic">· Bemor biriktirilmagan</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Qurilma tanlash */}
          <select 
            value={selectedDevice} 
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-slate-100/90 border border-slate-300 text-slate-700 text-sm font-medium rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {(devices || []).map((d) => (
              <option key={d.device_id} value={d.device_id}>
                {d.device_id} {d.label ? `(${d.label})` : ""}
              </option>
            ))}
          </select>

          {/* Fullscreen */}
          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleFullscreen}
            className="rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-600 shadow-sm"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Sensor Kartochkalari */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 my-6 flex-1">
        
        {/* 1. Yurak Pulsi (BPM) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-rose-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-500">
                <Heart className={`h-5 w-5 ${vitals.bpm > 0 ? "animate-bounce" : ""}`} />
              </div>
              <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Yurak Pulsi</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600">MAX30105</span>
          </div>

          <div className="my-5 flex items-baseline gap-3">
            <span className="text-6xl sm:text-7xl font-extrabold text-slate-900 font-mono tracking-tight">
              {vitals.bpm > 0 ? Math.round(vitals.bpm) : "--"}
            </span>
            <span className="text-lg font-medium text-slate-400">zarba/daq</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span className={`h-2.5 w-2.5 rounded-full ${vitals.bpm > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}></span>
            {vitals.bpm > 0 ? "Barmoq aniqlandi, o'lchanmoqda" : "Barmoqni datchikka qo'ying"}
          </div>
        </div>

        {/* 2. Kislorod (SpO2 %) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-sky-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-sky-50 text-sky-500">
                <Droplet className="h-5 w-5" />
              </div>
              <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Kislorod To'yinganligi</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-600">SpO2</span>
          </div>

          <div className="my-5 flex items-baseline gap-3">
            <span className="text-6xl sm:text-7xl font-extrabold text-slate-900 font-mono tracking-tight">
              {vitals.spo2 > 0 ? `${Math.round(vitals.spo2)}%` : "--"}
            </span>
            <span className="text-lg font-medium text-slate-400">to'yinganlik</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <CheckCircle2 className="h-4 w-4 text-sky-500" />
            Normal me'yor: 95% - 100%
          </div>
        </div>

        {/* 3. Qon Bosimi (Rossmax Z5) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-indigo-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-500">
                <Activity className="h-5 w-5" />
              </div>
              <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Qon Bosimi</span>
            </div>
            <Button 
              size="sm" 
              onClick={connectRossmax}
              disabled={bleConnecting}
              className="rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200 gap-1.5 shadow-none"
            >
              <Bluetooth className={`h-3.5 w-3.5 ${bleConnecting ? "animate-spin" : ""}`} />
              {bleConnecting ? "Ulanmoqda..." : "Rossmax Ulanish"}
            </Button>
          </div>

          <div className="my-5 flex items-baseline gap-2">
            <span className="text-5xl sm:text-6xl font-extrabold text-slate-900 font-mono tracking-tight">
              {(bleReading?.sys || vitals.systolic) ? `${bleReading?.sys || vitals.systolic}/${bleReading?.dia || vitals.diastolic}` : "--/--"}
            </span>
            <span className="text-base font-medium text-slate-400 ml-1">mmHg</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span>Rossmax Z5 (Bluetooth)</span>
            {(bleReading?.pul || vitals.bpPulse || vitals.bpm) ? (
              <span className="font-semibold text-indigo-600">PUL: {bleReading?.pul || vitals.bpPulse || vitals.bpm} /min</span>
            ) : null}
          </div>
        </div>

        {/* 4. Kabina Havosi (AHT10) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-teal-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                <Wind className="h-5 w-5" />
              </div>
              <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Kabina Iqlimi</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700">AHT10</span>
          </div>

          <div className="my-5 flex items-baseline justify-between">
            <div>
              <div className="text-4xl sm:text-5xl font-extrabold text-slate-900 font-mono tracking-tight">
                {vitals.airTemp ? `${vitals.airTemp.toFixed(1)}°C` : "--"}
              </div>
              <span className="text-xs font-medium text-slate-400">Harorat</span>
            </div>
            <div className="text-right">
              <div className="text-4xl sm:text-5xl font-extrabold text-slate-900 font-mono tracking-tight">
                {vitals.humidity ? `${Math.round(vitals.humidity)}%` : "--"}
              </div>
              <span className="text-xs font-medium text-slate-400">Namlik</span>
            </div>
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            Toza va qulay iqlim nazorati
          </div>
        </div>

        {/* 5. Suv Harorati (NTC 10K + Isitgich) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-amber-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Thermometer className="h-5 w-5" />
              </div>
              <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Suv Harorati</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">NTC 10K</span>
          </div>

          <div className="my-5 flex items-baseline gap-2">
            <span className="text-5xl sm:text-6xl font-extrabold text-slate-900 font-mono tracking-tight">
              {vitals.waterTemp ? `${vitals.waterTemp.toFixed(1)}°C` : "--"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            <span>Avtomatik isitish chegarasi: 22°C - 24°C</span>
          </div>
        </div>

        {/* 6. Suyuqlik Datchigi (XKC-Y28) */}
        <div className={`rounded-3xl p-6 sm:p-7 border shadow-sm flex flex-col justify-between relative overflow-hidden transition-all ${
          vitals.liquidEmpty 
            ? "bg-rose-50 border-rose-300 text-rose-900" 
            : "bg-white border-slate-200 text-slate-800"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${vitals.liquidEmpty ? "bg-rose-200 text-rose-700" : "bg-emerald-50 text-emerald-600"}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <span className="text-sm font-bold tracking-wide uppercase">Suyuqlik / Dori</span>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${vitals.liquidEmpty ? "bg-rose-200 text-rose-800" : "bg-emerald-50 text-emerald-700"}`}>
              XKC-Y28
            </span>
          </div>

          <div className="my-5">
            <div className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${vitals.liquidEmpty ? "text-rose-600 animate-pulse" : "text-emerald-600"}`}>
              {vitals.liquidEmpty ? "TUGADI! (Xavf)" : "Yetarli (Normal)"}
            </div>
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            {vitals.liquidEmpty ? "Klapan avtomatik tarzda yopildi" : "Suyuqlik me'yorida ta'minlanmoqda"}
          </div>
        </div>

      </div>

      {/* Pastki Harakatlar Paneli */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>AI Nurse Smart Cabin tizimi faol va xavfsiz ishlamoqda</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Antiseptik Tugmasi */}
          <Button
            size="lg"
            onClick={handleStartAntiseptic}
            disabled={antisepticLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-7 py-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-base gap-2"
          >
            <Sparkles className="h-5 w-5" />
            {antisepticLoading ? "Purkalmoqda..." : "🧴 Antiseptik Purkash (15s)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
