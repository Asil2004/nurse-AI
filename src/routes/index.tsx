import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "AI Nurse" }] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        navigate({ to: "/auth", replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
    </div>
  );
}
