import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const translations = {
  en: { home: "Home", questions: "Questions", community: "Community", premium: "Premium", reputation: "Reputation", security: "Security", language: "Language", login: "Log in", logout: "Log out" },
  es: { home: "Inicio", questions: "Preguntas", community: "Comunidad", premium: "Premium", reputation: "Reputación", security: "Seguridad", language: "Idioma", login: "Iniciar sesión", logout: "Cerrar sesión" },
  hi: { home: "होम", questions: "प्रश्न", community: "समुदाय", premium: "प्रीमियम", reputation: "प्रतिष्ठा", security: "सुरक्षा", language: "भाषा", login: "लॉग इन", logout: "लॉग आउट" },
  pt: { home: "Início", questions: "Perguntas", community: "Comunidade", premium: "Premium", reputation: "Reputação", security: "Segurança", language: "Idioma", login: "Entrar", logout: "Sair" },
  zh: { home: "首页", questions: "问题", community: "社区", premium: "高级", reputation: "声誉", security: "安全", language: "语言", login: "登录", logout: "退出" },
  fr: { home: "Accueil", questions: "Questions", community: "Communauté", premium: "Premium", reputation: "Réputation", security: "Sécurité", language: "Langue", login: "Connexion", logout: "Déconnexion" },
};
/**
 * Shape of the value exposed by LanguageProvider. Data fields are intentionally
 * `any` so existing consumer code keeps compiling unchanged.
 * @typedef {Object} LanguageContextValue
 * @property {any} language
 * @property {(value: any) => void} setPreferredLanguage
 * @property {(key: string) => any} t
 */

/** @type {import("react").Context<LanguageContextValue>} */
const LanguageContext = createContext(/** @type {any} */ (null));
export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguage] = useState("en");
  useEffect(() => { const stored = typeof window !== "undefined" ? localStorage.getItem("preferredLanguage") : null; setLanguage(stored || user?.preferredLanguage || "en"); }, [user?.preferredLanguage]);
  const setPreferredLanguage = (value) => { setLanguage(value); if (typeof window !== "undefined") localStorage.setItem("preferredLanguage", value); };
  const t = (key) => translations[language]?.[key] || translations.en[key] || key;
  return <LanguageContext.Provider value={{ language, setPreferredLanguage, t }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
