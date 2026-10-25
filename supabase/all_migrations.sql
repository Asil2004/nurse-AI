-- ================================================
-- AI NURSE — Barcha jadvallar va sozlamalar
-- Supabase SQL Editor'ga nusxalab, RUN bosing
-- ================================================

-- Roles (IF NOT EXISTS ni DO blok orqali qilamiz)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'nurse');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  birth_date date,
  gender text DEFAULT 'F',
  email text,
  phone text,
  photo_url text,
  login_username text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles admin insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles admin delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile (birinchi user admin bo'ladi)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_count int;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'nurse') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  age int NOT NULL DEFAULT 0,
  gender text NOT NULL DEFAULT 'F',
  condition text NOT NULL DEFAULT '',
  device_id text,
  prescriptions text NOT NULL DEFAULT '',
  nurse_notes text NOT NULL DEFAULT '',
  auto_mode boolean NOT NULL DEFAULT true,
  current_vitals jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_nurse_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients read assigned or admin" ON public.patients FOR SELECT
  USING (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "patients insert authenticated" ON public.patients FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "patients update assigned or admin" ON public.patients FOR UPDATE
  USING (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (assigned_nurse_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "patients delete admin" ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Vitals history
CREATE TABLE IF NOT EXISTS public.vitals (
  id bigserial PRIMARY KEY,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id text,
  bpm numeric, spo2 numeric, systolic numeric, diastolic numeric, air_temp numeric, humidity numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vitals TO authenticated;
GRANT ALL ON public.vitals TO service_role;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vitals read assigned or admin" ON public.vitals FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = vitals.patient_id AND p.assigned_nurse_id = auth.uid())
  );

-- Checkups
CREATE TABLE IF NOT EXISTS public.checkups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  nurse_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text DEFAULT '',
  vitals jsonb NOT NULL DEFAULT '{}'::jsonb,
  prescriptions text,
  nurse_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkups TO authenticated;
GRANT ALL ON public.checkups TO service_role;
ALTER TABLE public.checkups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkups read assigned or admin" ON public.checkups FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR nurse_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = checkups.patient_id AND p.assigned_nurse_id = auth.uid())
  );
CREATE POLICY "checkups insert assigned or admin" ON public.checkups FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid() = nurse_id AND EXISTS (
      SELECT 1 FROM public.patients p WHERE p.id = checkups.patient_id AND p.assigned_nurse_id = auth.uid()
    ))
  );

-- Medication logs
CREATE TABLE IF NOT EXISTS public.medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  nurse_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.medication_logs TO authenticated;
GRANT ALL ON public.medication_logs TO service_role;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medlogs read assigned or admin" ON public.medication_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR nurse_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = medication_logs.patient_id AND p.assigned_nurse_id = auth.uid())
  );
CREATE POLICY "medlogs insert assigned or admin" ON public.medication_logs FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid() = nurse_id AND EXISTS (
      SELECT 1 FROM public.patients p WHERE p.id = medication_logs.patient_id AND p.assigned_nurse_id = auth.uid()
    ))
  );

-- Liquid events
CREATE TABLE IF NOT EXISTS public.liquid_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id text,
  empty_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.liquid_events TO authenticated;
GRANT ALL ON public.liquid_events TO service_role;
ALTER TABLE public.liquid_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liquid read assigned or admin" ON public.liquid_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid())
  );
CREATE POLICY "liquid insert assigned or admin" ON public.liquid_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.patients p WHERE p.id = liquid_events.patient_id AND p.assigned_nurse_id = auth.uid()
    )
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

-- Work sessions
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nurse_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  total_break_seconds int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.work_sessions TO authenticated;
GRANT ALL ON public.work_sessions TO service_role;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws self read" ON public.work_sessions FOR SELECT TO authenticated USING (auth.uid() = nurse_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ws self insert" ON public.work_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = nurse_id);
CREATE POLICY "ws self update" ON public.work_sessions FOR UPDATE TO authenticated USING (auth.uid() = nurse_id);

-- Break events
CREATE TABLE IF NOT EXISTS public.break_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  nurse_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.break_events TO authenticated;
GRANT ALL ON public.break_events TO service_role;
ALTER TABLE public.break_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brk self read" ON public.break_events FOR SELECT TO authenticated USING (auth.uid() = nurse_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "brk self insert" ON public.break_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = nurse_id);
CREATE POLICY "brk self update" ON public.break_events FOR UPDATE TO authenticated USING (auth.uid() = nurse_id);

-- Devices
CREATE TABLE IF NOT EXISTS public.devices (
  device_id text PRIMARY KEY,
  pairing_token text NOT NULL,
  assigned_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  label text DEFAULT '',
  last_seen_at timestamptz,
  bp_measure_requested boolean NOT NULL DEFAULT false,
  antiseptic_start_requested boolean NOT NULL DEFAULT false,
  antiseptic_duration_s integer NOT NULL DEFAULT 15,
  heater_on_c numeric NOT NULL DEFAULT 22,
  heater_off_c numeric NOT NULL DEFAULT 24,
  alerts_armed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices admin all" ON public.devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "devices read for authenticated (no token column)" ON public.devices FOR SELECT TO authenticated USING (true);
REVOKE SELECT (pairing_token) ON public.devices FROM authenticated;
REVOKE SELECT (pairing_token) ON public.devices FROM anon;

-- Antiseptic events
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

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
DROP TRIGGER IF EXISTS trg_patients_updated ON public.patients;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vitals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liquid_events;

-- Function permissions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
