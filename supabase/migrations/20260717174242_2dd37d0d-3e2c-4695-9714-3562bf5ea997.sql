
-- Tighten patients access
DROP POLICY "patients read all authenticated" ON public.patients;
DROP POLICY "patients update authenticated" ON public.patients;
CREATE POLICY "patients read assigned or admin" ON public.patients FOR SELECT
  USING (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "patients update assigned or admin" ON public.patients FOR UPDATE
  USING (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- vitals: only for assigned patient's nurse or admin
DROP POLICY "vitals read authenticated" ON public.vitals;
CREATE POLICY "vitals read assigned or admin" ON public.vitals FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = vitals.patient_id AND p.assigned_nurse_id = auth.uid())
  );

-- checkups
DROP POLICY "checkups read authenticated" ON public.checkups;
CREATE POLICY "checkups read assigned or admin" ON public.checkups FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR nurse_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = checkups.patient_id AND p.assigned_nurse_id = auth.uid())
  );

-- medication_logs
DROP POLICY "medlogs read authenticated" ON public.medication_logs;
CREATE POLICY "medlogs read assigned or admin" ON public.medication_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR nurse_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = medication_logs.patient_id AND p.assigned_nurse_id = auth.uid())
  );

-- liquid_events
DROP POLICY "liquid read authenticated" ON public.liquid_events;
DROP POLICY "liquid update authenticated" ON public.liquid_events;
CREATE POLICY "liquid read assigned or admin" ON public.liquid_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid())
  );
CREATE POLICY "liquid update assigned or admin" ON public.liquid_events FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid())
  );

-- devices: restrict reads to admin or nurse assigned to the linked patient
DROP POLICY "devices read authenticated" ON public.devices;
CREATE POLICY "devices read admin or assigned nurse" ON public.devices FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (assigned_patient_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.patients p WHERE p.id = devices.assigned_patient_id AND p.assigned_nurse_id = auth.uid()
    ))
  );

-- Lock down has_role: only authenticated needs it for RLS; strip PUBLIC/anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
