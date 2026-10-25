import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — AI Nurse" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const identifierTrim = identifier.trim();
        if (identifierTrim.includes("@")) {
          const { error } = await supabase.auth.signInWithPassword({ email: identifierTrim, password });
          if (error) throw new Error("Invalid credentials");
        } else {
          const { signInWithLogin } = await import("@/lib/auth.functions");
          const tokens = await signInWithLogin({ data: { login: identifierTrim, password } });
          const { error } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
          if (error) throw error;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
        if (!isAdmin) {
          await supabase.from("work_sessions").insert({ nurse_id: session.user.id });
        }
        navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-sky-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-white/80 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow">
            <Activity className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold">{t.appName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.signInSubtitle}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label>{t.fullName}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label>{t.email}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t.login} / {t.email}</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder={t.usernamePlaceholder} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t.password}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "signin" ? t.signIn : "Create account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? "First time? " : "Have an account? "}
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-medium text-primary underline-offset-2 hover:underline">
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
          <p className="text-center text-[11px] text-muted-foreground">The first registered user becomes the admin.</p>
        </form>
        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">← Change language</Link>
        </div>
      </div>
    </div>
  );
}
