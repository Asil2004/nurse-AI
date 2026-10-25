import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateNurseSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  birth_date: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  login_username: z.string().optional().nullable(),
});

export const createNurse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateNurseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");

    const userId = created.user.id;
    // Ensure nurse role (trigger set default; make sure not admin)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "nurse" }, { onConflict: "user_id,role" });

    await supabaseAdmin.from("profiles").update({
      full_name: data.full_name,
      birth_date: data.birth_date || null,
      gender: data.gender || null,
      phone: data.phone || null,
      photo_url: data.photo_url || null,
      login_username: data.login_username || null,
    }).eq("id", userId);

    return { id: userId };
  });

export const deleteNurse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNurseProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    full_name: z.string().optional(),
    birth_date: z.string().optional().nullable(),
    gender: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    photo_url: z.string().optional().nullable(),
    login_username: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { user_id, password, ...rest } = data;
    const patch: {
      full_name?: string; birth_date?: string | null; gender?: string | null;
      phone?: string | null; photo_url?: string | null; login_username?: string | null;
    } = {};
    if (rest.full_name !== undefined) patch.full_name = rest.full_name;
    if (rest.birth_date !== undefined) patch.birth_date = rest.birth_date;
    if (rest.gender !== undefined) patch.gender = rest.gender;
    if (rest.phone !== undefined) patch.phone = rest.phone;
    if (rest.photo_url !== undefined) patch.photo_url = rest.photo_url;
    if (rest.login_username !== undefined) patch.login_username = rest.login_username;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", user_id);
      if (error) throw new Error(error.message);
    }
    if (password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
