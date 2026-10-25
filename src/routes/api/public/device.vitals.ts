import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  bpm: z.number().optional(),
  spo2: z.number().optional(),
  systolic: z.number().optional(),
  diastolic: z.number().optional(),
  air_temp: z.number().optional(),
  humidity: z.number().optional(),
  liquid_empty: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/device/vitals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-device-id, x-device-token",
        },
      }),
      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
        const deviceId = request.headers.get("x-device-id")?.trim();
        const token = request.headers.get("x-device-token")?.trim();
        if (!deviceId || !token) {
          return new Response(JSON.stringify({ error: "Missing device credentials" }), { status: 401, headers: cors });
        }
        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid body", details: parsed.error.issues }), { status: 400, headers: cors });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: device, error } = await supabaseAdmin.from("devices").select("*").eq("device_id", deviceId).maybeSingle();
        if (error || !device || device.pairing_token?.trim() !== token) {
          console.error(`[API Vitals 401] DevId: "${deviceId}", Token: "${token}", DB Token: "${device?.pairing_token}", Error:`, error);
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
        }
        const b = parsed.data;
        await supabaseAdmin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("device_id", deviceId);

        let patientId: string | null = device.assigned_patient_id ?? null;
        if (!patientId) {
          const { data: p } = await supabaseAdmin.from("patients").select("id").eq("device_id", deviceId).maybeSingle();
          if (p?.id) {
            patientId = p.id;
            await supabaseAdmin.from("devices").update({ assigned_patient_id: patientId }).eq("device_id", deviceId);
          }
        }
        if (patientId) {
          const { data: pData } = await supabaseAdmin.from("patients").select("current_vitals").eq("id", patientId).maybeSingle();
          const prevVitals = (pData?.current_vitals as any) || {};

          const current = {
            bpm: (b.bpm && b.bpm > 0) ? b.bpm : (prevVitals.bpm || 0),
            spo2: (b.spo2 && b.spo2 > 0) ? b.spo2 : (prevVitals.spo2 || 0),
            systolic: (b.systolic && b.systolic > 0) ? b.systolic : (prevVitals.systolic || 0),
            diastolic: (b.diastolic && b.diastolic > 0) ? b.diastolic : (prevVitals.diastolic || 0),
            bpPulse: prevVitals.bpPulse || (b.bpm || 0),
            airTemp: b.air_temp !== undefined ? b.air_temp : (prevVitals.airTemp || 0),
            humidity: b.humidity !== undefined ? b.humidity : (prevVitals.humidity || 0),
            updatedAt: new Date().toISOString()
          };

          await supabaseAdmin.from("patients").update({ current_vitals: current }).eq("id", patientId);

          // Faqat yangi ma'lumotlar bor bo'lsa vitals tarixiga yozish
          await supabaseAdmin.from("vitals").insert({
            patient_id: patientId, device_id: deviceId,
            bpm: b.bpm ?? null, spo2: b.spo2 ?? null,
            systolic: (b.systolic && b.systolic > 0) ? b.systolic : null,
            diastolic: (b.diastolic && b.diastolic > 0) ? b.diastolic : null,
            air_temp: b.air_temp ?? null, humidity: b.humidity ?? null,
          });
          if (b.liquid_empty) {
            await supabaseAdmin.from("liquid_events").insert({ patient_id: patientId, device_id: deviceId });
          }
        }

        // Commands: BP + antiseptic. Also return heater thresholds for the device.
        const dev = device as { bp_measure_requested?: boolean; antiseptic_start_requested?: boolean; antiseptic_duration_s?: number; heater_on_c?: number; heater_off_c?: number };
        const measureBp = Boolean(dev.bp_measure_requested);
        const startAntiseptic = Boolean(dev.antiseptic_start_requested);
        const updates: { bp_measure_requested?: boolean; antiseptic_start_requested?: boolean } = {};
        if (measureBp) updates.bp_measure_requested = false;
        if (startAntiseptic) updates.antiseptic_start_requested = false;
        if (Object.keys(updates).length) {
          await supabaseAdmin.from("devices").update(updates).eq("device_id", deviceId);
        }
        if (startAntiseptic && patientId) {
          await supabaseAdmin.from("antiseptic_events").insert({
            patient_id: patientId,
            device_id: deviceId,
            duration_s: dev.antiseptic_duration_s ?? 15,
            source: "web",
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          measure_bp: measureBp,
          start_antiseptic: startAntiseptic,
          antiseptic_duration_s: dev.antiseptic_duration_s ?? 15,
          heater_on_c: dev.heater_on_c ?? 22,
          heater_off_c: dev.heater_off_c ?? 24,
          alerts_armed: Boolean((device as { alerts_armed?: boolean }).alerts_armed),
        }), { status: 200, headers: cors });
      },
    },
  },
});
