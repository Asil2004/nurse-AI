
ALTER TABLE public.checkups
  ADD COLUMN IF NOT EXISTS prescriptions text,
  ADD COLUMN IF NOT EXISTS nurse_notes text;

CREATE OR REPLACE FUNCTION public.get_email_for_login(_login text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE login_username = _login LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_email_for_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_for_login(text) TO anon, authenticated;
