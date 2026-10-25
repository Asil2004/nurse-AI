-- Revoke column-level SELECT on the pairing token so it can never be read
-- through the Data API by admins or nurses. The service-role admin client
-- (used by the public device webhook) is unaffected and still verifies tokens.
REVOKE SELECT (pairing_token) ON public.devices FROM authenticated;
REVOKE SELECT (pairing_token) ON public.devices FROM anon;