import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const translations = {
  en: { home: "Home", questions: "Questions", community: "Community", premium: "Premium", reputation: "Reputation", security: "Security", language: "Language", login: "Log in", logout: "Log out" , tags: "Tags", users: "Users", admin: "Admin"},
  es: { home: "Inicio", questions: "Preguntas", community: "Comunidad", premium: "Premium", reputation: "Reputación", security: "Seguridad", language: "Idioma", login: "Iniciar sesión", logout: "Cerrar sesión" , tags: "Etiquetas", users: "Usuarios", admin: "Administración"},
  hi: { home: "होम", questions: "प्रश्न", community: "समुदाय", premium: "प्रीमियम", reputation: "प्रतिष्ठा", security: "सुरक्षा", language: "भाषा", login: "लॉग इन", logout: "लॉग आउट" , tags: "टैग", users: "उपयोगकर्ता", admin: "व्यवस्थापक"},
  pt: { home: "Início", questions: "Perguntas", community: "Comunidade", premium: "Premium", reputation: "Reputação", security: "Segurança", language: "Idioma", login: "Entrar", logout: "Sair" , tags: "Etiquetas", users: "Usuários", admin: "Administração"},
  zh: { home: "首页", questions: "问题", community: "社区", premium: "高级", reputation: "声誉", security: "安全", language: "语言", login: "登录", logout: "退出" , tags: "标签", users: "用户", admin: "管理员"},
  fr: { home: "Accueil", questions: "Questions", community: "Communauté", premium: "Premium", reputation: "Réputation", security: "Sécurité", language: "Langue", login: "Connexion", logout: "Déconnexion" , tags: "Étiquettes", users: "Utilisateurs", admin: "Administration"},
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
  // Keep <html lang> in step with the active language so assistive technology
  // announces content in the right language. This runs after mount only - the
  // server always renders lang="en", so mutating it here cannot affect hydration.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);
  const setPreferredLanguage = (value) => { setLanguage(value); if (typeof window !== "undefined") localStorage.setItem("preferredLanguage", value); };
  const t = (key) => translations[language]?.[key] || translations.en[key] || key;
  return <LanguageContext.Provider value={{ language, setPreferredLanguage, t }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
