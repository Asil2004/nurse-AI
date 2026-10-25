import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Create a device (admin only). Generates a pairing token.
export const createDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    device_id: z.string().min(3),
    label: z.string().optional(),
    assigned_patient_id: z.string().uuid().optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await context.supabase.from("devices").insert({
      device_id: data.device_id,
      pairing_token: token,
      label: data.label ?? "",
      assigned_patient_id: data.assigned_patient_id ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { device_id: data.device_id, pairing_token: token };
  });

export const rotateDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ device_id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await context.supabase.from("devices").update({ pairing_token: token }).eq("device_id", data.device_id);
    if (error) throw new Error(error.message);
    return { pairing_token: token };
  });
