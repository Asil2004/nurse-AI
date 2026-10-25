import { useEffect, useState, type ReactNode } from "react";
import { LanguageContext, LANG_STORAGE_KEY, dicts, type Lang, type LangCtx } from "@/lib/i18n";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
      if (stored === "uz" || stored === "ru" || stored === "en") setLangState(stored);
    } catch {}
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_STORAGE_KEY, l); } catch {}
  };

  const ctx: LangCtx = { lang, t: dicts[lang ?? "en"], setLang };
  return <LanguageContext.Provider value={ctx}>{children}</LanguageContext.Provider>;
}
