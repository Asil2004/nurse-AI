import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  LogIn
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "AI Nurse — Smart Cabin Monitor" }] }),
  component: HomePage,
});

function HomePage() {
  const [selectedDevice, setSelectedDevice] = useState<string>("box1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [antisepticLoading, setAntisepticLoading] = useState(false);
  const [bleReading, setBleReading] = useState<{ sys?: number; dia?: number; pul?: number } | null>(null);
  const [bleConnecting, setBleConnecting] = useState(false);

  // Qurilmalar ro'yxati
  const { data: devices } = useQuery({
    queryKey: ["home-devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("*");
      return data ?? [];
    },
  });

  // Tanlangan qurilmaning bemori va so'nggi ma'lumotlari
  const { data: currentPatient, refetch } = useQuery({
    queryKey: ["home-patient", selectedDevice],
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("*")
        .eq("device_id", selectedDevice)
        .maybeSingle();
      return data;
    },
    refetchInterval: 2000, // har 2 sekundda yangilanadi
  });

  // Realtime yangilanish
  useEffect(() => {
    const channel = supabase
      .channel("home-realtime")
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

  // Antiseptikni yoqish
  const handleStartAntiseptic = async () => {
    setAntisepticLoading(true);
    try {
      await supabase
        .from("devices")
        .update({ antiseptic_start_requested: true, antiseptic_duration_s: 15 } as any)
        .eq("device_id", selectedDevice);
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

  // Rossmax Z5 Web Bluetooth
  const connectRossmax = async () => {
    if (!("bluetooth" in navigator)) {
      toast.error("Brauzeringiz Bluetooth'ni qo'llab-quvvatlamaydi (Chrome kerak)");
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col justify-between select-none">
      {/* Yuqori Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/20 border border-blue-500/40 grid place-items-center text-blue-400">
            <Activity className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI NURSE — SMART CABIN</h1>
            <p className="text-xs text-slate-400">
              Qurilma: <span className="font-mono text-blue-400 font-semibold">{selectedDevice}</span>
              {currentPatient && (
                <span className="ml-3 text-slate-300">
                  Bemor: <b className="text-white">{currentPatient.name}</b> ({currentPatient.age} yosh)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Qurilmani tanlash */}
          <select 
            value={selectedDevice} 
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(devices || []).map((d) => (
              <option key={d.device_id} value={d.device_id}>
                {d.device_id} {d.label ? `(${d.label})` : ""}
              </option>
            ))}
          </select>

          {/* Fullscreen tugmasi */}
          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleFullscreen}
            className="border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>

          {/* Admin / Hamshira Paneli Tugmasi */}
          <Link to="/auth">
            <Button 
              variant="outline" 
              size="sm" 
              className="border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 gap-1.5 text-xs"
            >
              <LogIn className="h-3.5 w-3.5" /> Admin / Kirish
            </Button>
          </Link>
        </div>
      </div>

      {/* Sensor Ko'rsatkichlari (Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-6 flex-1">
        
        {/* 1. Yurak Pulsi (BPM) */}
        <div className="bg-slate-900/80 border border-rose-500/30 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider text-rose-400 uppercase">Yurak Pulsi</span>
            <Heart className={`h-6 w-6 text-rose-500 ${vitals.bpm > 0 ? "animate-ping" : ""}`} />
          </div>
          <div className="my-4 flex items-baseline gap-3">
            <span className="text-6xl sm:text-7xl font-black tracking-tight text-white font-mono">
              {vitals.bpm > 0 ? Math.round(vitals.bpm) : "--"}
            </span>
            <span className="text-xl font-medium text-slate-400">zarba/daq</span>
          </div>
          <div className="text-xs text-slate-400">
            {vitals.bpm > 0 ? "Normal holatda o'lchanmoqda" : "Barmoqni datchikka tekkizing"}
          </div>
        </div>

        {/* 2. Qon Kislorodi (SpO2) */}
        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-cyan-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider text-cyan-400 uppercase">Kislorod To'yinganligi</span>
            <Droplet className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="my-4 flex items-baseline gap-3">
            <span className="text-6xl sm:text-7xl font-black tracking-tight text-white font-mono">
              {vitals.spo2 > 0 ? `${Math.round(vitals.spo2)}%` : "--"}
            </span>
            <span className="text-xl font-medium text-slate-400">SpO2</span>
          </div>
          <div className="text-xs text-slate-400">
            Normal ko'rsatkich: 95% - 100%
          </div>
        </div>

        {/* 3. Qon Bosimi (Rossmax Z5) */}
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-indigo-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider text-indigo-400 uppercase">Qon Bosimi</span>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={connectRossmax}
              disabled={bleConnecting}
              className="border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs gap-1.5"
            >
              <Bluetooth className={`h-3.5 w-3.5 ${bleConnecting ? "animate-spin" : ""}`} />
              {bleConnecting ? "Ulanmoqda..." : "Rossmax Ulanish"}
            </Button>
          </div>
          <div className="my-4 flex items-baseline gap-3">
            <span className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono">
              {bleReading?.sys || vitals.systolic || "--"}/{bleReading?.dia || vitals.diastolic || "--"}
            </span>
            <span className="text-lg font-medium text-slate-400">mmHg</span>
          </div>
          <div className="text-xs text-slate-400">
            Tonometr: Rossmax Z5 (Bluetooth)
          </div>
        </div>

        {/* 4. Havo Harorati va Namligi */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider text-emerald-400 uppercase">Kabina Havosi</span>
            <Wind className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <div>
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono">
                {vitals.airTemp ? `${vitals.airTemp.toFixed(1)}°C` : "--"}
              </div>
              <span className="text-xs text-slate-400">Harorat</span>
            </div>
            <div className="text-right">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono">
                {vitals.humidity ? `${Math.round(vitals.humidity)}%` : "--"}
              </div>
              <span className="text-xs text-slate-400">Namlik</span>
            </div>
          </div>
          <div className="text-xs text-slate-400">AHT10 iqlim nazorati</div>
        </div>

        {/* 5. Suv Harorati va Isitgich */}
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider text-amber-400 uppercase">Suv Harorati</span>
            <Thermometer className="h-6 w-6 text-amber-400" />
          </div>
          <div className="my-4 flex items-baseline gap-3">
            <span className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono">
              {vitals.waterTemp ? `${vitals.waterTemp.toFixed(1)}°C` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-slate-300">Isitish chegarasi: 22°C - 24°C</span>
          </div>
        </div>

        {/* 6. Dori / Suyuqlik Holati */}
        <div className={`rounded-3xl p-6 flex flex-col justify-between border relative overflow-hidden shadow-lg ${
          vitals.liquidEmpty 
            ? "bg-rose-950/40 border-rose-500 text-rose-200 animate-pulse" 
            : "bg-slate-900/80 border-slate-800 text-slate-300"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-wider uppercase">Suyuqlik Datchigi</span>
            <AlertTriangle className={`h-6 w-6 ${vitals.liquidEmpty ? "text-rose-400" : "text-emerald-400"}`} />
          </div>
          <div className="my-4">
            <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {vitals.liquidEmpty ? "TUGADI! (Xavf)" : "Yetarli (Normal)"}
            </span>
          </div>
          <div className="text-xs opacity-75">
            {vitals.liquidEmpty ? "Dori tugadi — Klapan avtomatik yopildi!" : "Suyuqlik me'yorida oqmoqda"}
          </div>
        </div>

      </div>

      {/* Pastki Harakatlar Paneli */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
        <div className="text-xs text-slate-500">
          © AI Nurse Smart Cabin System · Asosiy Palata Monitori
        </div>

        <div className="flex items-center gap-3">
          {/* Antiseptik Tugmasi */}
          <Button
            size="lg"
            onClick={handleStartAntiseptic}
            disabled={antisepticLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-emerald-950/40 text-base gap-2"
          >
            <Sparkles className="h-5 w-5" />
            {antisepticLoading ? "Purkalmoqda..." : "🧴 Antiseptik Purkash (15s)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
