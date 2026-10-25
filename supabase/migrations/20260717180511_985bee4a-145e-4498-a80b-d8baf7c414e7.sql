CREATE POLICY "liquid insert assigned or admin" ON public.liquid_events FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid()
  )
);