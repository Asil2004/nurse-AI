CREATE POLICY "devices read for authenticated (no token column)" ON public.devices
FOR SELECT TO authenticated
USING (true);