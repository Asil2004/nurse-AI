import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, LogOut, Languages, Download, Shield, Coffee, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang, LANGUAGES, type Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function AppHeader({ isAdmin, userId, fullName }: { isAdmin: boolean; userId: string; fullName?: string }) {
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[2];
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [activeBreak, setActiveBreak] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const onBIP = (e: Event) => { e.preventDefault(); setInstallEvt(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvt(null); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Fetch current open work session
  useEffect(() => {
    if (isAdmin) return;
    (async () => {
      const { data } = await supabase.from("work_sessions")
        .select("id")
        .eq("nurse_id", userId)
        .is("logout_at", null)
        .order("login_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setSessionId(data.id);
        const { data: b } = await supabase.from("break_events")
          .select("id")
          .eq("session_id", data.id)
          .is("ended_at", null)
          .maybeSingle();
        if (b) setActiveBreak(b.id);
      } else {
        // No active session? create one
        const { data: created } = await supabase.from("work_sessions").insert({ nurse_id: userId }).select("id").single();
        if (created) setSessionId(created.id);
      }
    })();
  }, [isAdmin, userId]);

  const install = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  const toggleBreak = async () => {
    if (!sessionId) return;
    if (activeBreak) {
      const now = new Date().toISOString();
      const { data: b } = await supabase.from("break_events").select("started_at").eq("id", activeBreak).single();
      await supabase.from("break_events").update({ ended_at: now }).eq("id", activeBreak);
      if (b) {
        const secs = Math.round((new Date(now).getTime() - new Date(b.started_at).getTime()) / 1000);
        const { data: s } = await supabase.from("work_sessions").select("total_break_seconds").eq("id", sessionId).single();
        await supabase.from("work_sessions").update({ total_break_seconds: (s?.total_break_seconds ?? 0) + secs }).eq("id", sessionId);
      }
      setActiveBreak(null);
      toast.success("Break ended");
    } else {
      const { data } = await supabase.from("break_events").insert({ session_id: sessionId, nurse_id: userId }).select("id").single();
      if (data) { setActiveBreak(data.id); toast.info("Break started"); }
    }
  };

  const signOut = async () => {
    if (sessionId) {
      if (activeBreak) {
        const now = new Date().toISOString();
        const { data: b } = await supabase.from("break_events").select("started_at").eq("id", activeBreak).single();
        await supabase.from("break_events").update({ ended_at: now }).eq("id", activeBreak);
        if (b) {
          const secs = Math.round((new Date(now).getTime() - new Date(b.started_at).getTime()) / 1000);
          const { data: s } = await supabase.from("work_sessions").select("total_break_seconds").eq("id", sessionId).single();
          await supabase.from("work_sessions").update({ total_break_seconds: (s?.total_break_seconds ?? 0) + secs, logout_at: now }).eq("id", sessionId);
        } else {
          await supabase.from("work_sessions").update({ logout_at: now }).eq("id", sessionId);
        }
      } else {
        await supabase.from("work_sessions").update({ logout_at: new Date().toISOString() }).eq("id", sessionId);
      }
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const canInstall = !!installEvt && !installed;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={isAdmin ? "/admin" : "/dashboard"} className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Activity className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold leading-tight">{t.appName}</div>
            <div className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">{t.tagline}</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {isAdmin ? <Shield className="mr-1 inline h-3.5 w-3.5" /> : null}
            {isAdmin ? "Admin" : `${t.nurse} ${fullName ?? ""}`.trim()}
          </span>
          {!isAdmin && sessionId && (
            <Button variant={activeBreak ? "default" : "outline"} size="sm" onClick={toggleBreak}>
              {activeBreak ? <Play className="mr-1.5 h-4 w-4" /> : <Coffee className="mr-1.5 h-4 w-4" />}
              <span className="hidden sm:inline">{activeBreak ? "End break" : "Break"}</span>
            </Button>
          )}
          {canInstall && (
            <Button variant="outline" size="sm" onClick={install}>
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">{t.installApp}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Languages className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">{current.flag} {current.native}</span>
                <span className="sm:hidden">{current.flag}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LANGUAGES.map((l) => (
                <DropdownMenuItem key={l.code} onClick={() => setLang(l.code as Lang)}>
                  <span className="mr-2">{l.flag}</span>{l.native}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">{t.signOut}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
