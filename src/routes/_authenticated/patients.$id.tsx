import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Heart, Activity, Droplets, Thermometer, Save, Pill, AlertTriangle, Loader2, ChevronLeft, ChevronRight, RefreshCw, Bluetooth, Monitor } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { simulateVitals, type Vitals, defaultVitals } from "@/lib/types";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { requestBpMeasurement, startAntisepticNow, updateDeviceSettings, setDeviceAlertsArmed } from "@/lib/devices-bp.functions";
import { SprayCan, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  head: () => ({ meta: [{ title: "Patient — AI Nurse" }] }),
  component: PatientPage,
});

type CheckupRow = {
  id: string;
  created_at: string;
  vitals: Vitals;
  note: string | null;
  prescriptions: string | null;
  nurse_notes: string | null;
};

function PatientPage() {
  const { id } = useParams({ from: "/_authenticated/patients/$id" });
  const ctx = Route.useRouteContext();
  const { t } = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const profileQ = useQuery({
    queryKey: ["profile", ctx.user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", ctx.user.id).maybeSingle();
      return data;
    },
  });

  const patientQ = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const checkupsQ = useQuery({
    queryKey: ["checkups", id],
    queryFn: async () => {
      const { data } = await supabase.from("checkups").select("*").eq("patient_id", id).order("created_at", { ascending: false });
      return (data ?? []) as unknown as CheckupRow[];
    },
  });

  const medsQ = useQuery({
    queryKey: ["meds", id],
    queryFn: async () => {
      const { data } = await supabase.from("medication_logs").select("*").eq("patient_id", id).order("taken_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const deviceId = patientQ.data?.device_id ?? null;

  const deviceQ = useQuery({
    queryKey: ["device", deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("device_id, antiseptic_duration_s, heater_on_c, heater_off_c").eq("device_id", deviceId!).maybeSingle();
      return data;
    },
  });

  const antisepticQ = useQuery({
    queryKey: ["antiseptic", id],
    queryFn: async () => {
      const { data } = await supabase.from("antiseptic_events").select("id, started_at, duration_s, source").eq("patient_id", id).order("started_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const [antisepticDurS, setAntisepticDurS] = useState<number>(15);
  const [heaterOn, setHeaterOn] = useState<number>(22);
  const [heaterOff, setHeaterOff] = useState<number>(24);
  useEffect(() => {
    if (deviceQ.data) {
      setAntisepticDurS(Number(deviceQ.data.antiseptic_duration_s ?? 15));
      setHeaterOn(Number(deviceQ.data.heater_on_c ?? 22));
      setHeaterOff(Number(deviceQ.data.heater_off_c ?? 24));
    }
  }, [deviceQ.data]);


  const [vitals, setVitals] = useState<Vitals>(defaultVitals());
  const [autoMode, setAutoMode] = useState(true);
  const [prescriptions, setPrescriptions] = useState("");
  const [notes, setNotes] = useState("");
  const [alert, setAlert] = useState<{ ts: string; id: string } | null>(null);
  const [alertsArmed, setAlertsArmed] = useState(false);
  const alertsArmedRef = useRef(false);
  useEffect(() => { alertsArmedRef.current = alertsArmed; }, [alertsArmed]);

  useEffect(() => {
    if (patientQ.data) {
      const v = (patientQ.data.current_vitals as unknown as Vitals | null) ?? defaultVitals();
      setVitals(v);
      setAutoMode(patientQ.data.auto_mode);
      setPrescriptions(patientQ.data.prescriptions ?? "");
      setNotes(patientQ.data.nurse_notes ?? "");
    }
  }, [patientQ.data]);

  useEffect(() => {
    const ch = supabase
      .channel(`patient-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "patients", filter: `id=eq.${id}` }, (payload) => {
        const row = payload.new as { current_vitals?: Vitals };
        if (row.current_vitals) setVitals(row.current_vitals);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "liquid_events", filter: `patient_id=eq.${id}` }, (payload) => {
        const row = payload.new as { id: string; empty_at: string; acknowledged_at: string | null };
        if (!row.acknowledged_at) setAlert({ ts: row.empty_at, id: row.id });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const [bleConnecting, setBleConnecting] = useState(false);

  const measureRossmaxDirect = async () => {
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

        setVitals((v) => ({ ...v, systolic: sys, diastolic: dia, ...(pul > 0 ? { bpm: pul } : {}) }));
        toast.success(`Qon bosimi aniqlandi: ${sys}/${dia} mmHg`);

        await supabase.from("patients").update({
          current_vitals: { ...vitals, systolic: sys, diastolic: dia, ...(pul > 0 ? { bpm: pul } : {}), updatedAt: new Date().toISOString() }
        }).eq("id", id);

        await supabase.from("vitals").insert({
          patient_id: id,
          device_id: deviceId,
          systolic: sys,
          diastolic: dia,
          bpm: pul || null
        });
        qc.invalidateQueries({ queryKey: ["patient", id] });
      });
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        toast.error("Bluetooth xatosi: " + err.message);
      }
    } finally {
      setBleConnecting(false);
    }
  };

  useEffect(() => {
    // Agar bemorga haqiqiy ESP32 qurilmasi ulangan bo'lsa, soxta simulyatsiyani to'xtatamiz!
    if (!autoMode || deviceId) return;
    const t = setInterval(() => setVitals((v) => simulateVitals(v)), 3500);
    return () => clearInterval(t);
  }, [autoMode, deviceId]);

  // Audio: primed on any user gesture so beeps play when alert arrives via realtime
  const audioRef = useRef<AudioContext | null>(null);
  const primeAudio = () => {
    try {
      if (!audioRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new Ctor();
      }
      if (audioRef.current.state === "suspended") audioRef.current.resume();
    } catch { /* ignore */ }
  };
  useEffect(() => {
    const handler = () => primeAudio();
    window.addEventListener("pointerdown", handler, { once: false });
    window.addEventListener("keydown", handler, { once: false });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    if (!alert) return;
    const beep = () => {
      try {
        if (!audioRef.current) {
          const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioRef.current = new Ctor();
        }
        const ac = audioRef.current;
        if (ac.state === "suspended") ac.resume();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        osc.connect(gain); gain.connect(ac.destination);
        gain.gain.setValueAtTime(0.0001, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.55);
        osc.start();
        osc.stop(ac.currentTime + 0.6);
      } catch { /* ignore */ }
      if ("vibrate" in navigator) navigator.vibrate?.([300, 120, 300]);
    };
    beep();
    const iv = setInterval(beep, 1600);
    return () => clearInterval(iv);
  }, [alert]);

  const setAlertsArmedFn = useServerFn(setDeviceAlertsArmed);

  const acknowledgeAlert = async () => {
    if (!alert) return;
    if (!alert.id.startsWith("local-")) {
      await supabase.from("liquid_events").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: ctx.user.id }).eq("id", alert.id);
    }
    setAlert(null);
    setAlertsArmed(false);
    const devId = patientQ.data?.device_id;
    if (devId) {
      try { await setAlertsArmedFn({ data: { deviceId: devId, armed: false } }); } catch { /* ignore */ }
    }
  };

  const saveVitals = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("patients").update({
        current_vitals: { ...vitals, updatedAt: new Date().toISOString() },
        auto_mode: autoMode,
        prescriptions, nurse_notes: notes,
      }).eq("id", id);
      if (error) throw error;
      await supabase.from("vitals").insert({
        patient_id: id,
        bpm: vitals.bpm, spo2: vitals.spo2, systolic: vitals.systolic, diastolic: vitals.diastolic,
        air_temp: vitals.airTemp, humidity: vitals.humidity,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["patient", id] }); toast.success(t.vitalsSaved); },
  });

  const logMed = async () => {
    primeAudio();
    setAlertsArmed(true);
    await supabase.from("medication_logs").insert({ patient_id: id, nurse_id: ctx.user.id });
    const devId = patientQ.data?.device_id;
    if (devId) {
      try { await setAlertsArmedFn({ data: { deviceId: devId, armed: true } }); } catch { /* ignore */ }
    }
    qc.invalidateQueries({ queryKey: ["meds", id] });
    toast.success(t.medicationLogged);
  };

  const addCheckup = async () => {
    await supabase.from("checkups").insert({
      patient_id: id,
      nurse_id: ctx.user.id,
      vitals: JSON.parse(JSON.stringify(vitals)),
      note: "",
      prescriptions,
      nurse_notes: notes,
    });
    qc.invalidateQueries({ queryKey: ["checkups", id] });
    toast.success(t.checkupAdded);
  };

  const simulateEmpty = async () => {
    primeAudio();
    const nowIso = new Date().toISOString();
    setAlert({ ts: nowIso, id: `local-${Date.now()}` });
    const { data } = await supabase
      .from("liquid_events")
      .insert({ patient_id: id, device_id: patientQ.data?.device_id ?? null })
      .select("id, empty_at")
      .maybeSingle();
    if (data) setAlert({ ts: data.empty_at ?? nowIso, id: data.id });
  };

  // Per-block refresh: fetch latest reading from device stream (vitals table) for
  // every column in the block at once, update local state, and persist.
  const blockColumns: Record<string, { field: keyof Vitals; col: string }[]> = {
    bpmSpo2: [{ field: "bpm", col: "bpm" }, { field: "spo2", col: "spo2" }],
    bp: [{ field: "systolic", col: "systolic" }, { field: "diastolic", col: "diastolic" }],
    env: [{ field: "airTemp", col: "air_temp" }, { field: "humidity", col: "humidity" }],
  };
  const [refreshingBlock, setRefreshingBlock] = useState<string | null>(null);
  const refreshBlock = async (block: keyof typeof blockColumns) => {
    setRefreshingBlock(block);
    try {
      const cols = blockColumns[block];
      const next: Vitals = { ...vitals, updatedAt: new Date().toISOString() };
      let gotAny = false;
      for (const { field, col } of cols) {
        const { data } = await supabase
          .from("vitals").select(`${col}, recorded_at`).eq("patient_id", id)
          .not(col, "is", null).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
        const row = data as Record<string, unknown> | null;
        const val = row?.[col];
        if (val != null) { (next as Record<string, unknown>)[field] = Number(val); gotAny = true; }
      }
      if (!gotAny) { toast.error("—"); return; }
      setVitals(next);
      const { error: upErr } = await supabase.from("patients").update({ current_vitals: next }).eq("id", id);
      if (upErr) throw upErr;
      qc.invalidateQueries({ queryKey: ["patient", id] });
      toast.success(t.vitalsSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshingBlock(null);
    }
  };

  const [requestingBp, setRequestingBp] = useState(false);
  const requestBpFn = useServerFn(requestBpMeasurement);
  const requestBpMeasurementClick = async () => {
    const deviceId = patientQ.data?.device_id;
    if (!deviceId) { toast.error(t.noCabin); return; }
    setRequestingBp(true);
    try {
      await requestBpFn({ data: { deviceId } });
      toast.success(t.bpRequestSent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRequestingBp(false);
    }
  };

  const startAntisepticFn = useServerFn(startAntisepticNow);
  const updateSettingsFn = useServerFn(updateDeviceSettings);
  const [startingAntiseptic, setStartingAntiseptic] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const triggerAntiseptic = async () => {
    if (!deviceId) { toast.error(t.noCabin); return; }
    setStartingAntiseptic(true);
    try {
      await startAntisepticFn({ data: { deviceId } });
      await supabase.from("antiseptic_events").insert({
        patient_id: id, device_id: deviceId, nurse_id: ctx.user.id,
        duration_s: antisepticDurS, source: "web",
      });
      qc.invalidateQueries({ queryKey: ["antiseptic", id] });
      toast.success(t.antisepticStarted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setStartingAntiseptic(false);
    }
  };

  const saveCabinSettings = async () => {
    if (!deviceId) { toast.error(t.noCabin); return; }
    setSavingSettings(true);
    try {
      await updateSettingsFn({ data: { deviceId, antisepticDurationS: antisepticDurS, heaterOnC: heaterOn, heaterOffC: heaterOff } });
      qc.invalidateQueries({ queryKey: ["device", deviceId] });
      toast.success(t.settingsSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSettings(false);
    }
  };



  const lastMed = medsQ.data?.[0]?.taken_at;

  if (patientQ.isLoading) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!patientQ.data) return <div className="p-8">{t.patientNotFound}</div>;

  return (
    <div className="min-h-screen">
      <AppHeader isAdmin={ctx.isAdmin} userId={ctx.user.id} fullName={profileQ.data?.full_name} />

      {alert && (
        <div className="sticky top-16 z-30 border-b border-red-200 bg-gradient-to-r from-red-500 via-rose-500 to-red-500 text-white shadow-lg">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="alert-pulse grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20 text-2xl" aria-hidden>💧</span>
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> {t.liquidAlertTitle}
                </div>
                <div className="text-xs opacity-95">{t.liquidAlertDesc(new Date(alert.ts).toLocaleTimeString())}</div>
                {patientQ.data?.device_id && (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    📣 {t.callNurseDevice(patientQ.data.device_id)}
                  </div>
                )}
              </div>
            </div>
            <Button variant="secondary" className="rounded-full font-semibold" onClick={acknowledgeAlert}>{t.acknowledgeAlert}</Button>
          </div>
        </div>
      )}


      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{patientQ.data.name}</h1>
            <p className="text-sm text-muted-foreground">{patientQ.data.age} · {patientQ.data.gender} · {patientQ.data.condition}</p>
            <p className="mt-1 text-xs text-muted-foreground">{patientQ.data.device_id ? t.connectedTo(patientQ.data.device_id) : t.noCabin}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              size="lg" 
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-sm"
              onClick={() => navigate({ 
                to: "/kiosk", 
                search: { 
                  patientId: id, 
                  deviceId: patientQ.data?.device_id || undefined 
                } 
              })}
            >
              <Monitor className="mr-2 h-4 w-4" />
              📱 Palata Ekrani (Kiosk)
            </Button>
            <Button size="lg" onClick={logMed}><Pill className="mr-2 h-4 w-4" />{t.takeMedication}</Button>
            <Button variant="outline" size="lg" onClick={simulateEmpty}>{t.simulateNoLiquid}</Button>
            <Button variant="secondary" size="lg" onClick={addCheckup}>{t.logCheckupNow}</Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
          <div className="flex items-center gap-3">
            <Switch checked={autoMode} onCheckedChange={setAutoMode} />
            <div>
              <div className="font-medium">{autoMode ? t.autoMode : t.manualMode}</div>
              <div className="text-xs text-muted-foreground">{autoMode ? t.autoModeHint : t.manualModeHint}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <VitalCard title={t.bpmSpo2} icon={<Heart className="h-4 w-4" />} tone="rose" onRefresh={autoMode ? () => refreshBlock("bpmSpo2") : undefined} refreshing={refreshingBlock === "bpmSpo2"} refreshLabel={t.getNewData}>
            <VitalRow label={t.heartRate} unit="bpm" value={vitals.bpm} onChange={(v) => setVitals({ ...vitals, bpm: v })} readonly={autoMode} />
            <VitalRow label={t.oxygenSat} unit="%" value={vitals.spo2} onChange={(v) => setVitals({ ...vitals, spo2: v })} readonly={autoMode} />
          </VitalCard>
          <VitalCard title={t.bloodPressure} icon={<Activity className="h-4 w-4" />} tone="violet" onRefresh={autoMode ? () => refreshBlock("bp") : undefined} refreshing={refreshingBlock === "bp"} refreshLabel={t.getNewData}>
            <VitalRow label={t.systolic} unit="mmHg" value={vitals.systolic} onChange={(v) => setVitals({ ...vitals, systolic: v })} readonly={autoMode} />
            <VitalRow label={t.diastolic} unit="mmHg" value={vitals.diastolic} onChange={(v) => setVitals({ ...vitals, diastolic: v })} readonly={autoMode} />
            <VitalRow label="Puls / min" unit="zarba/daq" value={vitals.bpPulse || vitals.bpm || 0} onChange={(v) => setVitals({ ...vitals, bpPulse: v })} readonly={autoMode} />
            <Button 
              size="sm" 
              variant="secondary" 
              className="mt-2 w-full rounded-full gap-1.5 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300" 
              onClick={measureRossmaxDirect} 
              disabled={bleConnecting}
            >
              {bleConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
              {bleConnecting ? "Ulanmoqda..." : "Bluetooth orqali qon bosimini o'lchash"}
            </Button>
          </VitalCard>
          <VitalCard title={t.cabinEnv} icon={<Thermometer className="h-4 w-4" />} tone="teal" onRefresh={autoMode ? () => refreshBlock("env") : undefined} refreshing={refreshingBlock === "env"} refreshLabel={t.getNewData}>
            <VitalRow label={t.airTemp} unit="°C" value={vitals.airTemp} onChange={(v) => setVitals({ ...vitals, airTemp: v })} readonly={autoMode} step={0.1} />
            <VitalRow label={t.humidity} unit="%" value={vitals.humidity} onChange={(v) => setVitals({ ...vitals, humidity: v })} readonly={autoMode} step={0.1} />
          </VitalCard>
        </div>


        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t.lastUpdated(new Date(vitals.updatedAt).toLocaleTimeString())}</span>
          <Button size="sm" onClick={() => saveVitals.mutate()} disabled={saveVitals.isPending}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> {t.saveVitals}
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card-elevated rounded-2xl p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-semibold">{t.prescriptions}</h3>
              <span className="text-xs text-muted-foreground">{t.prescriptionsHint}</span>
            </div>
            <Textarea rows={5} value={prescriptions} onChange={(e) => setPrescriptions(e.target.value)} placeholder={t.prescriptionsPlaceholder} />
          </div>
          <div className="card-elevated rounded-2xl p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-semibold">{t.nurseNotes}</h3>
              <span className="text-xs text-muted-foreground">{t.nurseNotesHint}</span>
            </div>
            <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.nurseNotesPlaceholder} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card-elevated rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Pill className="h-4 w-4" /> {t.lastMedication}
            </div>
            <div className="mt-1 text-lg font-medium">{lastMed ? new Date(lastMed).toLocaleString() : t.notYetTaken}</div>
          </div>
          <div className="card-elevated rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Droplets className="h-4 w-4" /> {t.lastLiquidEmpty}
            </div>
            <div className="mt-1 text-lg font-medium">{alert ? new Date(alert.ts).toLocaleString() : t.noIncidents}</div>
          </div>
        </div>

        {deviceId && (
          <div className="mt-6 card-elevated rounded-2xl p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><SprayCan className="h-4 w-4 text-emerald-600" /> {t.cabinControls}</h3>
                <p className="text-xs text-muted-foreground">{t.cabinControlsHint}</p>
              </div>
              <span className="text-xs text-muted-foreground">{t.cabinDeviceLabel}: {deviceId}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-4">
                <label className="text-xs font-medium text-muted-foreground">{t.antisepticDuration}</label>
                <div className="mt-1 flex items-center gap-2">
                  <Input type="number" min={1} max={600} value={antisepticDurS} onChange={(e) => setAntisepticDurS(Number(e.target.value))} className="w-24" />
                  <span className="text-sm text-muted-foreground">{t.seconds}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.antisepticDurationHint}</p>
                <Button size="sm" className="mt-3 w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={triggerAntiseptic} disabled={startingAntiseptic}>
                  {startingAntiseptic ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <SprayCan className="mr-1.5 h-3.5 w-3.5" />}
                  {t.startAntiseptic}
                </Button>
              </div>
              <div className="rounded-xl border border-orange-200/60 bg-orange-50/50 p-4 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-orange-600" /> {t.heaterHint}</label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{t.heaterOn}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Input type="number" step={0.1} value={heaterOn} onChange={(e) => setHeaterOn(Number(e.target.value))} className="w-24" />
                      <span className="text-sm text-muted-foreground">°C</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t.heaterOff}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Input type="number" step={0.1} value={heaterOff} onChange={(e) => setHeaterOff(Number(e.target.value))} className="w-24" />
                      <span className="text-sm text-muted-foreground">°C</span>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" className="mt-3 rounded-full" onClick={saveCabinSettings} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  {t.saveSettings}
                </Button>
              </div>
            </div>
          </div>
        )}

        <CheckupCalendar checkups={checkupsQ.data ?? []} meds={medsQ.data ?? []} antiseptics={antisepticQ.data ?? []} />
      </main>
    </div>
  );
}

const TONES: Record<string, { bg: string; ring: string; icon: string; btn: string }> = {
  rose:   { bg: "bg-gradient-to-br from-rose-50 via-pink-50 to-white",     ring: "ring-1 ring-rose-200/70",   icon: "bg-rose-100 text-rose-600",     btn: "bg-rose-600 hover:bg-rose-700 text-white" },
  violet: { bg: "bg-gradient-to-br from-violet-50 via-indigo-50 to-white", ring: "ring-1 ring-violet-200/70", icon: "bg-violet-100 text-violet-600", btn: "bg-violet-600 hover:bg-violet-700 text-white" },
  teal:   { bg: "bg-gradient-to-br from-teal-50 via-sky-50 to-white",      ring: "ring-1 ring-teal-200/70",   icon: "bg-teal-100 text-teal-600",     btn: "bg-teal-600 hover:bg-teal-700 text-white" },
};

function VitalCard({ title, icon, children, tone = "rose", onRefresh, refreshing, refreshLabel }: { title: string; icon: React.ReactNode; children: React.ReactNode; tone?: keyof typeof TONES; onRefresh?: () => void; refreshing?: boolean; refreshLabel?: string }) {
  const T = TONES[tone] ?? TONES.rose;
  return (
    <div className={`rounded-2xl p-5 shadow-sm ${T.bg} ${T.ring}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className={`grid h-8 w-8 place-items-center rounded-xl ${T.icon}`}>{icon}</span>
          <span className="font-semibold text-foreground">{title}</span>
        </div>
        {onRefresh && (
          <Button type="button" size="sm" onClick={onRefresh} disabled={refreshing} className={`h-8 rounded-full px-3 text-xs ${T.btn}`}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshLabel}
          </Button>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function VitalRow({ label, value, unit, onChange, readonly, step }: { label: string; value: number; unit: string; onChange: (v: number) => void; readonly?: boolean; step?: number }) {
  const displayVal = (value && value > 0) ? value : "—";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 backdrop-blur-sm">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {readonly ? (
          <span className="font-display text-xl font-semibold">{displayVal}{displayVal !== "—" && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}</span>
        ) : (
          <div className="flex items-center gap-1">
            <Input type="number" step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-24 text-right" />
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Calendar ----------

type MedRow = { id: string; taken_at: string };
type AntisepticRow = { id: string; started_at: string; duration_s: number; source: string };

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CheckupCalendar({ checkups, meds, antiseptics }: { checkups: CheckupRow[]; meds: MedRow[]; antiseptics: AntisepticRow[] }) {
  const { t } = useLang();
  const [view, setView] = useState<"day" | "month" | "year">("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date>(new Date());

  const checkupDayKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of checkups) s.add(new Date(c.created_at).toDateString());
    return s;
  }, [checkups]);

  const filtered = useMemo(() => {
    if (view === "day") return checkups.filter((c) => sameDay(new Date(c.created_at), selected));
    if (view === "month") return checkups.filter((c) => {
      const d = new Date(c.created_at);
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    });
    return checkups.filter((c) => new Date(c.created_at).getFullYear() === cursor.getFullYear());
  }, [checkups, view, cursor, selected]);

  const medsFiltered = useMemo(() => {
    if (view === "day") return meds.filter((m) => sameDay(new Date(m.taken_at), selected));
    if (view === "month") return meds.filter((m) => {
      const d = new Date(m.taken_at);
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    });
    return meds.filter((m) => new Date(m.taken_at).getFullYear() === cursor.getFullYear());
  }, [meds, view, cursor, selected]);

  const antisepticFiltered = useMemo(() => {
    if (view === "day") return antiseptics.filter((a) => sameDay(new Date(a.started_at), selected));
    if (view === "month") return antiseptics.filter((a) => {
      const d = new Date(a.started_at);
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    });
    return antiseptics.filter((a) => new Date(a.started_at).getFullYear() === cursor.getFullYear());
  }, [antiseptics, view, cursor, selected]);


  const label = view === "day"
    ? selected.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : view === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : String(cursor.getFullYear());

  return (
    <div className="mt-8 card-elevated rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t.checkupHistory}</h3>
          <p className="text-xs text-muted-foreground">{t.checkupHistoryHint}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/60 p-1 text-xs">
          {(["day", "month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "day" ? t.day : v === "month" ? t.month : t.year}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => {
          const d = new Date(cursor);
          if (view === "year") d.setFullYear(d.getFullYear() - 1);
          else if (view === "month") d.setMonth(d.getMonth() - 1);
          else d.setDate(d.getDate() - 1);
          setCursor(d);
          if (view === "day") setSelected(d);
        }}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-sm font-medium">{label}</div>
        <Button variant="ghost" size="sm" onClick={() => {
          const d = new Date(cursor);
          if (view === "year") d.setFullYear(d.getFullYear() + 1);
          else if (view === "month") d.setMonth(d.getMonth() + 1);
          else d.setDate(d.getDate() + 1);
          setCursor(d);
          if (view === "day") setSelected(d);
        }}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {view === "month" && (
        <MonthGrid
          cursor={cursor}
          checkupDayKeys={checkupDayKeys}
          selected={selected}
          onSelect={(d) => { setSelected(d); setView("day"); setCursor(d); }}
        />
      )}

      {view === "year" && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 12 }).map((_, m) => {
            const monthDate = new Date(cursor.getFullYear(), m, 1);
            const hasAny = checkups.some((c) => {
              const d = new Date(c.created_at);
              return d.getFullYear() === cursor.getFullYear() && d.getMonth() === m;
            });
            return (
              <button key={m} onClick={() => { setCursor(monthDate); setView("month"); }} className={`rounded-lg border border-border/60 p-3 text-left hover:bg-muted/50 ${hasAny ? "bg-medical-soft/60" : ""}`}>
                <div className="text-sm font-medium">{monthDate.toLocaleDateString(undefined, { month: "long" })}</div>
                <div className="text-xs text-muted-foreground">{hasAny ? "•" : "—"}</div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{t.checkupsFor(label)}</div>
          <div className="text-xs text-muted-foreground">{filtered.length} · {medsFiltered.length} {t.takeMedication.toLowerCase()}</div>
        </div>
        {filtered.length === 0 && medsFiltered.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noCheckupsRange}</p>
        )}
        <div className="space-y-3">
          {filtered.map((c) => <CheckupCard key={c.id} c={c} />)}
          {medsFiltered.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t.lastMedication}</div>
              <ul className="space-y-1 text-sm">
                {medsFiltered.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Pill className="h-3.5 w-3.5 text-medical" />
                    {new Date(m.taken_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {antisepticFiltered.length > 0 && (
            <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4">
              <div className="mb-2 text-xs font-semibold uppercase text-emerald-700">{t.antisepticEvents}</div>
              <ul className="space-y-1 text-sm">
                {antisepticFiltered.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <SprayCan className="h-3.5 w-3.5 text-emerald-600" />
                    {t.antisepticEventAt(new Date(a.started_at).toLocaleString(), a.duration_s)}
                    <span className="ml-auto text-xs text-muted-foreground">{a.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ cursor, checkupDayKeys, selected, onSelect }: { cursor: Date; checkupDayKeys: Set<string>; selected: Date; onSelect: (d: Date) => void }) {
  const { t } = useLang();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
        {t.weekdaysShort.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const has = checkupDayKeys.has(d.toDateString());
          const isSel = sameDay(d, selected);
          return (
            <button
              key={i}
              onClick={() => onSelect(d)}
              className={`aspect-square rounded-lg border text-sm transition-colors ${
                isSel ? "border-primary bg-primary text-primary-foreground" :
                has ? "border-medical/40 bg-medical-soft text-medical hover:bg-medical-soft/80" :
                "border-border/60 hover:bg-muted/50"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckupCard({ c }: { c: CheckupRow }) {
  const { t } = useLang();
  const v = (c.vitals ?? {}) as Partial<Vitals>;
  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{new Date(c.created_at).toLocaleString()}</div>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div><span className="font-medium text-foreground">{t.heartRate}:</span> {v.bpm ?? "—"} bpm</div>
        <div><span className="font-medium text-foreground">{t.oxygenSat}:</span> {v.spo2 ?? "—"}%</div>
        <div><span className="font-medium text-foreground">{t.bloodPressure}:</span> {v.systolic ?? "—"}/{v.diastolic ?? "—"}</div>
        <div><span className="font-medium text-foreground">{t.airTemp}:</span> {v.airTemp ?? "—"}°C</div>
        <div><span className="font-medium text-foreground">{t.humidity}:</span> {v.humidity ?? "—"}%</div>
      </div>
      {(c.prescriptions || c.nurse_notes || c.note) && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-sm">
          {c.prescriptions && (
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{t.prescriptions}</div>
              <p className="whitespace-pre-wrap">{c.prescriptions}</p>
            </div>
          )}
          {c.nurse_notes && (
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{t.nurseNotes}</div>
              <p className="whitespace-pre-wrap">{c.nurse_notes}</p>
            </div>
          )}
          {c.note && (
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">Note</div>
              <p className="whitespace-pre-wrap">{c.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
