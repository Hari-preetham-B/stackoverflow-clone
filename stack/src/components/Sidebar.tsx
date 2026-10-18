import { cn } from "@/lib/utils";
import { Bookmark, Home, MessageSquareIcon, Tag, Users, Shield, Crown, Trophy, Globe2 } from "lucide-react";
import Link from "next/link";
import React from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";

const Sidebar = ({ isopen }: any) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const links = [
    ["/", t("home"), Home],
    ["/questions", t("questions"), MessageSquareIcon],
    ["/tags", t("tags"), Tag],
    ["/users", t("users"), Users],
    ["/community", t("community"), Bookmark],
    ["/subscription", t("premium"), Crown],
    ["/reputation", t("reputation"), Trophy],
    ["/security", t("security"), Shield],
    ["/settings/language", t("language"), Globe2],
  ];
  if (user?.role === "admin") links.push(["/admin", t("admin"), Shield]);
  // On small screens the sidebar is an off-canvas drawer, so it must be taken
  // out of the flex flow with `fixed`. Previously it stayed in flow and was
  // only translated off-screen, which still reserved its 192px width and
  // squeezed <main> to roughly 150px - long page content then overflowed the
  // viewport horizontally. From `md` up it returns to the normal document flow.
  return <aside className={cn("top-13.25 w-48 lg:w-64 min-h-screen bg-white shadow-sm border-r transition-transform duration-200 ease-in-out md:translate-x-0 fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto", isopen ? "translate-x-0" : "-translate-x-full")}><nav className="p-2 lg:p-4"><ul className="space-y-1">{links.map(([href,label,Icon]: any)=><li key={href}><Link href={href} className="flex items-center px-2 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm"><Icon className="w-4 h-4 mr-2 lg:mr-3" />{label}</Link></li>)}</ul></nav></aside>;
};
export default Sidebar;
