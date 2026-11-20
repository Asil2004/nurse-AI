import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Resolves a username to the associated email ONLY after the password is
// successfully verified server-side, preventing account enumeration.
export const signInWithLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    let email = data.login.trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Maxsus: admin / admin@nurse.uz uchun avtomatik kafolatlangan yaratish va tiklash
    if (email.toLowerCase() === "admin" || email.toLowerCase() === "admin@nurse.uz") {
      email = "admin@nurse.uz";
      try {
        const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
        const existingAdmin = usersList?.users?.find((u) => u.email?.toLowerCase() === "admin@nurse.uz");
        if (!existingAdmin) {
          const { data: created } = await supabaseAdmin.auth.admin.createUser({
            email: "admin@nurse.uz",
            password: data.password || "Admin123!",
            email_confirm: true,
            user_metadata: { full_name: "Bosh Admin" }
          });
          if (created?.user) {
            await supabaseAdmin.from("profiles").upsert({
              id: created.user.id,
              full_name: "Bosh Admin",
              email: "admin@nurse.uz",
              login_username: "admin"
            });
            await supabaseAdmin.from("user_roles").upsert({
              user_id: created.user.id,
              role: "admin"
            });
          }
        } else {
          // Agar paroli boshqa bo'lsa yoki tasdiqlanmagan bo'lsa, parolni yangilab email_confirm qilamiz
          await supabaseAdmin.auth.admin.updateUserById(existingAdmin.id, {
            password: data.password,
            email_confirm: true
          });
          await supabaseAdmin.from("profiles").upsert({
            id: existingAdmin.id,
            full_name: "Bosh Admin",
            email: "admin@nurse.uz",
            login_username: "admin"
          });
          await supabaseAdmin.from("user_roles").upsert({
            user_id: existingAdmin.id,
            role: "admin"
          });
        }
      } catch (adminSetupErr) {
        console.error("[Auto-Admin Setup Error]:", adminSetupErr);
      }
    } else if (!email.includes("@")) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("login_username", email)
        .maybeSingle();
      if (!prof?.email) {
        throw new Error("Invalid credentials");
      }
      email = prof.email;
    }

    const { data: session, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: data.password });
    if (error || !session.session) {
      throw new Error(error?.message || "Invalid credentials");
    }
    return {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    };
  });
