import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Pencil, User as UserIcon, Loader2, Cpu, RefreshCw, Copy, BarChart3, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createNurse, deleteNurse, updateNurseProfile } from "@/lib/nurses.functions";
import { createDevice, rotateDeviceToken } from "@/lib/devices.functions";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — AI Nurse" }] }),
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminPanel,
});

type NurseForm = {
  id?: string;
  email: string; password: string;
  full_name: string; birth_date: string; gender: string;
  phone: string; photo_url: string; login_username: string;
};
const emptyNurse: NurseForm = { email: "", password: "", full_name: "", birth_date: "", gender: "F", phone: "", photo_url: "", login_username: "" };

function AdminPanel() {
  const ctx = Route.useRouteContext();
  const { t } = useLang();

  return (
    <div className="min-h-screen">
      <AppHeader isAdmin={ctx.isAdmin} userId={ctx.user.id} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t.adminPanel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.adminSubtitle}</p>
        </div>
        <Tabs defaultValue="nurses" className="mt-6">
          <TabsList>
            <TabsTrigger value="nurses"><Users className="mr-1.5 h-4 w-4" />{t.nursesList}</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="mr-1.5 h-4 w-4" />Statistics</TabsTrigger>
            <TabsTrigger value="devices"><Cpu className="mr-1.5 h-4 w-4" />Devices</TabsTrigger>
          </TabsList>
          <TabsContent value="nurses"><NursesTab /></TabsContent>
          <TabsContent value="stats"><StatsTab /></TabsContent>
          <TabsContent value="devices"><DevicesTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function NursesTab() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NurseForm>(emptyNurse);

  const createFn = useServerFn(createNurse);
  const deleteFn = useServerFn(deleteNurse);
  const updateFn = useServerFn(updateNurseProfile);

  const nursesQ = useQuery({
    queryKey: ["admin-nurses"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "nurse");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      return data ?? [];
    },
  });

  const openNew = () => { setForm(emptyNurse); setOpen(true); };
  const openEdit = (p: { id: string; full_name: string; birth_date: string | null; gender: string | null; phone: string | null; photo_url: string | null; login_username: string | null; email: string | null }) => {
    setForm({
      id: p.id, email: p.email ?? "", password: "",
      full_name: p.full_name, birth_date: p.birth_date ?? "", gender: p.gender ?? "F",
      phone: p.phone ?? "", photo_url: p.photo_url ?? "", login_username: p.login_username ?? "",
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      if (!form.full_name.trim()) { toast.error(t.requiredFields); return; }
      if (form.id) {
        await updateFn({
          data: {
            user_id: form.id,
            full_name: form.full_name, birth_date: form.birth_date || null, gender: form.gender,
            phone: form.phone, photo_url: form.photo_url, login_username: form.login_username,
            password: form.password || null,
          },
        });
        toast.success(t.nurseUpdated);
      } else {
        if (!form.email || !form.password) { toast.error(t.requiredFields); return; }
        await createFn({
          data: {
            email: form.email, password: form.password, full_name: form.full_name,
            birth_date: form.birth_date || null, gender: form.gender, phone: form.phone,
            photo_url: form.photo_url, login_username: form.login_username,
          },
        });
        toast.success(t.nurseAdded);
      }
      qc.invalidateQueries({ queryKey: ["admin-nurses"] });
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setForm((s) => ({ ...s, photo_url: String(r.result) }));
    r.readAsDataURL(f);
  };

  return (
    <div className="mt-4">
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />{t.addNurse}</Button>
      </div>
      {nursesQ.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(nursesQ.data ?? []).map((n) => (
          <div key={n.id} className="card-elevated rounded-2xl p-5">
            <div className="flex items-start gap-3">
              {n.photo_url ? (
                <img src={n.photo_url} alt={n.full_name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-medical-soft text-medical"><UserIcon className="h-6 w-6" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{n.full_name}</div>
                <div className="truncate text-xs text-muted-foreground">{n.email}</div>
                <div className="mt-1 text-xs text-muted-foreground">{n.gender} · {n.birth_date ?? "—"}</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground truncate">📱 {n.phone || "—"}</div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => openEdit(n)}><Pencil className="mr-1 h-3.5 w-3.5" />{t.editNurse}</Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
                if (!confirm(t.confirmDelete)) return;
                try { await deleteFn({ data: { user_id: n.id } }); qc.invalidateQueries({ queryKey: ["admin-nurses"] }); toast.success(t.nurseDeleted); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        {(nursesQ.data?.length ?? 0) === 0 && !nursesQ.isLoading && (
          <div className="col-span-full rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">{t.noNurses}</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? t.editNurse : t.addNurse}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="flex items-center gap-3">
              {form.photo_url ? <img src={form.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-xl bg-muted text-muted-foreground"><UserIcon className="h-6 w-6" /></div>}
              <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>{t.fullName} *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t.email} *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!form.id} /></div>
              <div className="space-y-1.5"><Label>{t.password} {form.id ? "" : "*"}</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? "Leave blank to keep" : ""} /></div>
              <div className="space-y-1.5"><Label>{t.birthDate}</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t.gender}</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="F">{t.female}</SelectItem>
                    <SelectItem value="M">{t.male}</SelectItem>
                    <SelectItem value="Other">{t.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t.phone}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>{t.login}</Label><Input value={form.login_username} onChange={(e) => setForm({ ...form, login_username: e.target.value })} placeholder="optional handle" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button onClick={submit}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatsTab() {
  const nursesQ = useQuery({
    queryKey: ["admin-stats-nurses"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "nurse");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const [{ data: sessions }, { data: meds }, { data: checkups }] = await Promise.all([
        supabase.from("work_sessions").select("*").in("nurse_id", ids).gte("login_at", iso),
        supabase.from("medication_logs").select("nurse_id, patient_id, taken_at").in("nurse_id", ids).gte("taken_at", iso),
        supabase.from("checkups").select("nurse_id, patient_id, created_at").in("nurse_id", ids).gte("created_at", iso),
      ]);
      return (profiles ?? []).map((p) => {
        const ss = (sessions ?? []).filter((s) => s.nurse_id === p.id);
        const workMs = ss.reduce((sum, s) => {
          const start = new Date(s.login_at).getTime();
          const end = s.logout_at ? new Date(s.logout_at).getTime() : Date.now();
          return sum + (end - start) - (s.total_break_seconds ?? 0) * 1000;
        }, 0);
        const breakMs = ss.reduce((s, x) => s + (x.total_break_seconds ?? 0) * 1000, 0);
        const first = ss.sort((a, b) => a.login_at.localeCompare(b.login_at))[0];
        const patientsSet = new Set<string>();
        (meds ?? []).filter((m) => m.nurse_id === p.id).forEach((m) => patientsSet.add(m.patient_id));
        (checkups ?? []).filter((c) => c.nurse_id === p.id).forEach((c) => patientsSet.add(c.patient_id));
        return {
          id: p.id, name: p.full_name,
          loginAt: first?.login_at,
          workHours: workMs / 3600000,
          breakMinutes: breakMs / 60000,
          patients: patientsSet.size,
          meds: (meds ?? []).filter((m) => m.nurse_id === p.id).length,
          checkups: (checkups ?? []).filter((c) => c.nurse_id === p.id).length,
        };
      });
    },
  });

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Today's nurse activity</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Nurse</th>
              <th className="p-3">Login</th>
              <th className="p-3">Work</th>
              <th className="p-3">Breaks</th>
              <th className="p-3">Patients</th>
              <th className="p-3">Meds</th>
              <th className="p-3">Checkups</th>
            </tr>
          </thead>
          <tbody>
            {(nursesQ.data ?? []).map((n) => (
              <tr key={n.id} className="border-t border-border/60">
                <td className="p-3 font-medium">{n.name}</td>
                <td className="p-3">{n.loginAt ? new Date(n.loginAt).toLocaleTimeString() : "—"}</td>
                <td className="p-3">{n.workHours.toFixed(1)}h</td>
                <td className="p-3">{n.breakMinutes.toFixed(0)}m</td>
                <td className="p-3">{n.patients}</td>
                <td className="p-3">{n.meds}</td>
                <td className="p-3">{n.checkups}</td>
              </tr>
            ))}
            {(nursesQ.data?.length ?? 0) === 0 && !nursesQ.isLoading && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DevicesTab() {
  const qc = useQueryClient();
  const createFn = useServerFn(createDevice);
  const rotateFn = useServerFn(rotateDeviceToken);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ device_id: "", label: "" });
  const [lastToken, setLastToken] = useState<{ id: string; token: string } | null>(null);

  const devicesQ = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("device_id, label, assigned_patient_id, last_seen_at, created_at").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${origin}/api/public/device/vitals`;

  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
        <h2 className="font-semibold">Connect an ESP32 to AI Nurse</h2>
        <p className="mt-1 text-sm text-muted-foreground">Register a cabin device below. Copy the device ID and pairing token into your ESP32 firmware; it will post vitals over Wi-Fi to the endpoint.</p>
        <div className="mt-3 rounded-lg bg-background p-3 font-mono text-xs">
          <div><span className="text-muted-foreground">POST</span> {endpoint}</div>
          <div className="mt-1 text-muted-foreground">Headers: X-Device-Id, X-Device-Token</div>
          <div className="mt-1 text-muted-foreground">Body: {"{ bpm, spo2, systolic, diastolic, air_temp, humidity, liquid_empty?: boolean }"}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => { setForm({ device_id: "", label: "" }); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Add device</Button>
      </div>

      {lastToken && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
          <div className="font-semibold">Pairing token for {lastToken.id}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-xs">
            <code className="rounded bg-background px-2 py-1">{lastToken.token}</code>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(lastToken.token); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Save this token — it won't be shown again.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(devicesQ.data ?? []).map((d) => (
          <div key={d.device_id} className="card-elevated rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-medical" />
              <div className="font-semibold">{d.device_id}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{d.label || "—"}</div>
            <div className="mt-2 text-xs text-muted-foreground">Last seen: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "never"}</div>
            <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={async () => {
              const r = await rotateFn({ data: { device_id: d.device_id } });
              setLastToken({ id: d.device_id, token: r.pairing_token });
              qc.invalidateQueries({ queryKey: ["admin-devices"] });
              toast.success("Token rotated");
            }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Rotate token</Button>
          </div>
        ))}
        {(devicesQ.data?.length ?? 0) === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">No devices yet.</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add device</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5"><Label>Device ID *</Label><Input value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} placeholder="AIN-001" /></div>
            <div className="space-y-1.5"><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Cabin #1 — Lobby" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              try {
                const r = await createFn({ data: { device_id: form.device_id, label: form.label } });
                setLastToken({ id: r.device_id, token: r.pairing_token });
                qc.invalidateQueries({ queryKey: ["admin-devices"] });
                setOpen(false);
                toast.success("Device created");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
