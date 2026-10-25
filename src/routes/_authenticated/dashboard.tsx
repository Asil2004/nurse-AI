import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, Wifi, WifiOff, User as UserIcon, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AI Nurse" }] }),
  component: Dashboard,
});

function Dashboard() {
  const ctx = Route.useRouteContext();
  const { t } = useLang();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", age: 30, gender: "F", condition: "", device_id: null as string | null });

  const patientsQ = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const devicesQ = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("device_id, label, assigned_patient_id, last_seen_at");
      return data ?? [];
    },
  });

  const profileQ = useQuery({
    queryKey: ["profile", ctx.user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", ctx.user.id).maybeSingle();
      return data;
    },
  });

  const addPatient = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        condition: form.condition,
        device_id: form.device_id,
        assigned_nurse_id: ctx.user.id,
        created_by: ctx.user.id,
      };
      const { data: inserted, error } = await supabase.from("patients").insert(payload).select("id").single();
      if (error) throw error;
      if (form.device_id && inserted?.id) {
        await supabase.from("devices").update({ assigned_patient_id: inserted.id }).eq("device_id", form.device_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(t.patientAdded);
      setOpen(false);
      setForm({ name: "", age: 30, gender: "F", condition: "", device_id: null });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateDevice = async (patientId: string, deviceId: string | null) => {
    const { error } = await supabase.from("patients").update({ device_id: deviceId }).eq("id", patientId);
    if (error) { toast.error(error.message); return; }
    // Keep devices.assigned_patient_id in sync so the /api/public/device/vitals endpoint routes readings.
    await supabase.from("devices").update({ assigned_patient_id: null }).eq("assigned_patient_id", patientId);
    if (deviceId) {
      await supabase.from("devices").update({ assigned_patient_id: patientId }).eq("device_id", deviceId);
    }
    qc.invalidateQueries({ queryKey: ["patients"] });
    toast.success(deviceId ? t.connectedTo(deviceId) : t.cabinUnlinked);
  };

  const patients = (patientsQ.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.condition.toLowerCase().includes(search.toLowerCase())
  );
  const assigned = patients.filter((p) => p.device_id).length;
  const devices = devicesQ.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader isAdmin={ctx.isAdmin} userId={ctx.user.id} fullName={profileQ.data?.full_name} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t.patientManagement}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.registeredCount(patients.length, assigned)}</p>
          </div>
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> {t.addPatient}
          </Button>
        </div>

        <div className="mt-6 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPatients} className="pl-9" />
        </div>

        {patientsQ.isLoading && (
          <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <div key={p.id} className="card-elevated rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-medical-soft text-medical">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.age} · {p.gender} · {p.condition || "—"}</div>
                </div>
                <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${p.device_id ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {p.device_id ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {p.device_id ? t.online : t.offline}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label className="text-[11px] text-muted-foreground">{t.cabinDevice}</Label>
                <Select value={p.device_id ?? "__none__"} onValueChange={(v) => updateDevice(p.id, v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t.noDevice}</SelectItem>
                    {devices.map((d) => (
                      <SelectItem key={d.device_id} value={d.device_id}>{d.device_id}{d.label ? ` — ${d.label}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link to="/patients/$id" params={{ id: p.id }} className="block">
                  <Button variant="secondary" className="mt-2 w-full">{t.openProfile}</Button>
                </Link>
              </div>
            </div>
          ))}
          {!patientsQ.isLoading && patients.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              {t.noPatients}
            </div>
          )}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.registerPatient}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>{t.fullName} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.age}</Label>
                <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t.gender}</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="F">{t.female}</SelectItem>
                    <SelectItem value="M">{t.male}</SelectItem>
                    <SelectItem value="Other">{t.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.condition}</Label>
              <Input value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.assignCabin}</Label>
              <Select value={form.device_id ?? "__none__"} onValueChange={(v) => setForm({ ...form, device_id: v === "__none__" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t.noDevice}</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.device_id} value={d.device_id}>{d.device_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button onClick={() => {
              if (!form.name.trim() || !form.age) { toast.error(t.nameAgeRequired); return; }
              addPatient.mutate();
            }} disabled={addPatient.isPending}>
              {addPatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
