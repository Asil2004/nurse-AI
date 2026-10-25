-- Admin foydalanuvchini auth.users jadvaliga to'g'ridan-to'g'ri yaratish
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  encrypted_pw text := crypt('Admin123!', gen_salt('bf'));
BEGIN
  -- Agar admin avval yaratilmagan bo'lsa
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@nurse.uz') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'admin@nurse.uz',
      encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Bosh Admin"}',
      now(),
      now()
    );

    -- Profile yaratish
    INSERT INTO public.profiles (id, full_name, email, login_username)
    VALUES (new_user_id, 'Bosh Admin', 'admin@nurse.uz', 'admin')
    ON CONFLICT (id) DO UPDATE SET full_name = 'Bosh Admin';

    -- Admin roli berish
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE 'Admin yaratildi! Email: admin@nurse.uz, Parol: Admin123!';
  ELSE
    RAISE NOTICE 'Admin allaqachon mavjud!';
  END IF;
END $$;
