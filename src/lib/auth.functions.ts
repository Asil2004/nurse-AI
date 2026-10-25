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

    if (!email.includes("@")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("login_username", email)
        .maybeSingle();
      if (!prof?.email) {
        // Generic error — do not leak whether the username exists.
        throw new Error("Invalid credentials");
      }
      email = prof.email;
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: session, error } = await supabase.auth.signInWithPassword({ email, password: data.password });
    if (error || !session.session) {
      throw new Error("Invalid credentials");
    }
    return {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    };
  });
