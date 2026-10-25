import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang, LANGUAGES, type Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "AI Nurse" }] }),
  component: Home,
});

function Home() {
  const { lang, setLang } = useLang();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setChecking(false); return; }
      const { data: role } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      navigate({ to: role ? "/admin" : "/dashboard", replace: true });
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-sky-50 via-white to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lang) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-sky-50 via-white to-blue-50 px-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-border/60 bg-white/80 p-8 shadow-xl backdrop-blur">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow">
              <Activity className="h-5 w-5" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold">AI Nurse</h1>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Choose language / Til / Язык
            </p>
          </div>
          <div className="grid gap-2">
            {LANGUAGES.map((l) => (
              <Button key={l.code} size="lg" variant="outline" className="justify-start text-base" onClick={() => setLang(l.code as Lang)}>
                <span className="mr-3 text-xl">{l.flag}</span>{l.native}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Language chosen and no session — redirect to auth
  navigate({ to: "/auth", replace: true });
  return null;
}
