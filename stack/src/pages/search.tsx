import Mainlayout from "@/layout/Mainlayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
export default function SearchPage(){const router=useRouter();const[q,setQ]=useState("");const[advanced,setAdvanced]=useState(false);const[results,setResults]=useState<any[]>([]);const search=async()=>{if(!q.trim())return;try{const r=await axiosInstance.get(`/question/search?q=${encodeURIComponent(q)}&advanced=${advanced}`);setResults(r.data.data)}catch(e:any){toast.error(e.response?.data?.message||"Search failed")}};useEffect(()=>{if(router.isReady&&typeof router.query.q==='string'){setQ(router.query.q);axiosInstance.get(`/question/search?q=${encodeURIComponent(router.query.q)}&advanced=false`).then(r=>setResults(r.data.data)).catch(()=>{})}},[router.isReady,router.query.q]);return <Mainlayout><div className="max-w-5xl mx-auto"><div className="flex gap-2 mb-4"><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search questions" onKeyDown={e=>{if(e.key==='Enter')search()}}/><Button onClick={search} className="bg-blue-600">Search</Button></div><label className="flex items-center gap-2 text-sm mb-6"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)}/> Advanced search (Bronze or higher)</label><div>{results.map(q=><div key={q._id} className="border-b py-4"><Link href={`/questions/${q._id}`} className="text-blue-600 font-semibold">{q.questiontitle}</Link><p className="text-sm text-gray-600">{q.questionbody.slice(0,180)}</p><div className="flex gap-1 mt-2">{q.questiontags.map((t:string)=><Badge key={t}>{t}</Badge>)}</div></div>)}</div></div></Mainlayout>}
