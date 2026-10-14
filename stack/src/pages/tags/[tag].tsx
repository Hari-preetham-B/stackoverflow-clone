import Mainlayout from "@/layout/Mainlayout";
import { useRouter } from "next/router";
export default function TagPage(){const r=useRouter();return <Mainlayout><div className="max-w-5xl mx-auto"><h1 className="text-2xl font-semibold">Tag: {r.query.tag}</h1></div></Mainlayout>}
