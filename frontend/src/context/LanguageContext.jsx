import { createContext, useContext, useState } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("cooksmart_lang") || "en"
  );

  function toggleLang() {
    const next = lang === "en" ? "lg" : "en";
    setLang(next);
    localStorage.setItem("cooksmart_lang", next);
  }

  // Returns the translation for key in the active language,
  // falling back to English, then to the bare key if missing.
  function t(key) {
    return translations[lang]?.[key] ?? translations.en[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within <LanguageProvider>");
  return ctx;
}
