
-- 1. Drop username→email enumeration function
DROP FUNCTION IF EXISTS public.get_email_for_login(text);

-- 2. Switch has_role to SECURITY INVOKER (user_roles RLS allows self-reads, which is what policies need)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 3. Devices: admins only (drop nurse read policy)
DROP POLICY IF EXISTS "devices read admin or assigned nurse" ON public.devices;

-- 4. Tighten INSERT scope on checkups
DROP POLICY IF EXISTS "checkups insert authenticated" ON public.checkups;
CREATE POLICY "checkups insert assigned or admin" ON public.checkups
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    auth.uid() = nurse_id
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = checkups.patient_id
        AND p.assigned_nurse_id = auth.uid()
    )
  )
);

-- 5. Tighten INSERT scope on medication_logs
DROP POLICY IF EXISTS "medlogs insert authenticated" ON public.medication_logs;
CREATE POLICY "medlogs insert assigned or admin" ON public.medication_logs
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    auth.uid() = nurse_id
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = medication_logs.patient_id
        AND p.assigned_nurse_id = auth.uid()
    )
  )
);
