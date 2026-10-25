
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'nurse');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE public.profiles (
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

-- Auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  -- default role: nurse
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'nurse') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients
CREATE TABLE public.patients (
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
CREATE POLICY "patients read all authenticated" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "patients insert authenticated" ON public.patients FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "patients update authenticated" ON public.patients FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "patients delete admin" ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Vitals history (from device)
CREATE TABLE public.vitals (
  id bigserial PRIMARY KEY,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id text,
  bpm numeric, spo2 numeric, systolic numeric, diastolic numeric, air_temp numeric, humidity numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vitals TO authenticated;
GRANT ALL ON public.vitals TO service_role;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vitals read authenticated" ON public.vitals FOR SELECT TO authenticated USING (true);

-- Checkups
CREATE TABLE public.checkups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  nurse_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text DEFAULT '',
  vitals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkups TO authenticated;
GRANT ALL ON public.checkups TO service_role;
ALTER TABLE public.checkups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkups read authenticated" ON public.checkups FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkups insert authenticated" ON public.checkups FOR INSERT TO authenticated WITH CHECK (auth.uid() = nurse_id OR public.has_role(auth.uid(), 'admin'));

-- Medication logs
CREATE TABLE public.medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  nurse_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.medication_logs TO authenticated;
GRANT ALL ON public.medication_logs TO service_role;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medlogs read authenticated" ON public.medication_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "medlogs insert authenticated" ON public.medication_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = nurse_id OR public.has_role(auth.uid(), 'admin'));

-- Liquid events
CREATE TABLE public.liquid_events (
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
CREATE POLICY "liquid read authenticated" ON public.liquid_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "liquid update authenticated" ON public.liquid_events FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Work sessions
CREATE TABLE public.work_sessions (
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
CREATE TABLE public.break_events (
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
CREATE TABLE public.devices (
  device_id text PRIMARY KEY,
  pairing_token text NOT NULL,
  assigned_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  label text DEFAULT '',
  last_seen_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices admin all" ON public.devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "devices read authenticated" ON public.devices FOR SELECT TO authenticated USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vitals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liquid_events;
