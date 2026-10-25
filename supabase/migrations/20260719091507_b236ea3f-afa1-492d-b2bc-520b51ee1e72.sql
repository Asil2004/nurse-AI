
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS antiseptic_start_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS antiseptic_duration_s integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS heater_on_c numeric NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS heater_off_c numeric NOT NULL DEFAULT 24;

CREATE TABLE IF NOT EXISTS public.antiseptic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id text,
  nurse_id uuid,
  duration_s integer NOT NULL DEFAULT 15,
  source text NOT NULL DEFAULT 'web',
  started_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.antiseptic_events TO authenticated;
GRANT ALL ON public.antiseptic_events TO service_role;

ALTER TABLE public.antiseptic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurse or admin can read antiseptic events for their patients"
  ON public.antiseptic_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = antiseptic_events.patient_id AND p.assigned_nurse_id = auth.uid())
  );

CREATE POLICY "Nurse or admin can insert antiseptic events for their patients"
  ON public.antiseptic_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = antiseptic_events.patient_id AND p.assigned_nurse_id = auth.uid())
  );
