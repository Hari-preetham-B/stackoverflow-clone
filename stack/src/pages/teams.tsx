import Mainlayout from "@/layout/Mainlayout";
import Link from "next/link";
export default function TeamsPage(){return <Mainlayout><div className="max-w-3xl mx-auto space-y-4"><h1 className="text-3xl font-semibold">For Teams</h1><p>Teams can use the project&apos;s shared community, search and premium capabilities.</p><Link href="/subscription" className="text-blue-600 hover:underline">View premium plans</Link></div></Mainlayout>}
