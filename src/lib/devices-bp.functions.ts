import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestBpMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ deviceId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin OR is the assigned nurse for a patient linked to this device
    const { data: isAdminRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isAdmin = Boolean(isAdminRow);

    if (!isAdmin) {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, assigned_nurse_id")
        .eq("device_id", data.deviceId)
        .maybeSingle();
      if (!patient || patient.assigned_nurse_id !== userId) {
        throw new Error("Forbidden");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("devices")
      .update({ bp_measure_requested: true })
      .eq("device_id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertAllowed(supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>; from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string; assigned_nurse_id: string | null } | null }> } } } }, userId: string, deviceId: string) {
  const { data: isAdminRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdminRow) return;
  const { data: patient } = await supabase.from("patients").select("id, assigned_nurse_id").eq("device_id", deviceId).maybeSingle();
  if (!patient || patient.assigned_nurse_id !== userId) throw new Error("Forbidden");
}

export const startAntisepticNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ deviceId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAllowed(context.supabase as never, context.userId, data.deviceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("devices")
      .update({ antiseptic_start_requested: true })
      .eq("device_id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDeviceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    deviceId: z.string().min(1),
    antisepticDurationS: z.number().int().min(1).max(600).optional(),
    heaterOnC: z.number().min(-10).max(50).optional(),
    heaterOffC: z.number().min(-10).max(50).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAllowed(context.supabase as never, context.userId, data.deviceId);
    const patch: { antiseptic_duration_s?: number; heater_on_c?: number; heater_off_c?: number } = {};
    if (data.antisepticDurationS != null) patch.antiseptic_duration_s = data.antisepticDurationS;
    if (data.heaterOnC != null) patch.heater_on_c = data.heaterOnC;
    if (data.heaterOffC != null) patch.heater_off_c = data.heaterOffC;
    if (!Object.keys(patch).length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("devices").update(patch).eq("device_id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDeviceAlertsArmed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ deviceId: z.string().min(1), armed: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAllowed(context.supabase as never, context.userId, data.deviceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("devices")
      .update({ alerts_armed: data.armed })
      .eq("device_id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
