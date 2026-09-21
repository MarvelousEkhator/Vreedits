"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { LANGUAGES, normalizeLang, detectBrowserLang, translate } from "@/lib/i18n";

const LanguageContext = createContext(null);
const STORAGE_KEY = "vreedits-lang";

export function LanguageProvider({ userLanguage, children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}

    // 1) what the user picked on this device
    let chosen = normalizeLang(saved);
    // 2) their saved account language, if it isn't just the English default
    if (!chosen) {
      const fromAccount = normalizeLang(userLanguage);
      if (fromAccount && fromAccount !== "en") chosen = fromAccount;
    }
    // 3) their phone / browser language (automatic detection)
    if (!chosen) chosen = detectBrowserLang();

    setLangState(chosen || "en");
  }, [userLanguage]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((value) => {
    const next = normalizeLang(value) || "en";
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const t = useCallback((key) => translate(lang, key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  // Safe fallback if a page isn't wrapped yet
  return {
    lang: "en",
    setLang: () => {},
    t: (key) => translate("en", key),
    languages: LANGUAGES,
  };
}