import Mainlayout from "@/layout/Mainlayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function ReputationPage(){
  const[data,setData]=useState<any>(null); const[receiverId,setReceiverId]=useState(""); const[amount,setAmount]=useState("10"); const[reason,setReason]=useState("Reputation transfer");
  const load=async()=>{try{const r=await axiosInstance.get("/reputation/me");setData(r.data.data)}catch(e:any){toast.error(e.response?.data?.message||"Unable to load reputation")}};
  useEffect(()=>{load()},[]);
  const transfer=async()=>{try{await axiosInstance.post("/reputation/transfer",{receiverId,amount:Number(amount),reason});toast.success("Reputation transferred");setReceiverId("");await load()}catch(e:any){toast.error(e.response?.data?.message||"Transfer failed")}};
  return <Mainlayout><div className="max-w-4xl mx-auto space-y-6"><Card><CardHeader><CardTitle>Reputation</CardTitle></CardHeader><CardContent>{data&&<><div className="text-4xl font-bold mb-4">{data.reputation}</div><div className="grid md:grid-cols-2 gap-2 text-sm mb-6">{Object.entries(data.privileges).map(([k,v])=><div key={k} className="border p-2 rounded">{k}: {String(v)}</div>)}</div><h3 className="font-semibold mb-2">History</h3>{data.history.map((h:any)=><div key={h._id} className="border-b py-2 text-sm">{h.amount>0?"+":""}{h.amount} · {h.reason} · {new Date(h.createdAt).toLocaleString()}</div>)}</>}</CardContent></Card><Card><CardHeader><CardTitle>Transfer reputation</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-gray-600">Available only when your reputation is above 50. Maximum 50 per transaction and 100 per day.</p><Input placeholder="Receiver user ID" value={receiverId} onChange={e=>setReceiverId(e.target.value)}/><Input type="number" min={1} max={50} value={amount} onChange={e=>setAmount(e.target.value)}/><Input placeholder="Reason" value={reason} onChange={e=>setReason(e.target.value)}/><Button onClick={transfer} className="bg-blue-600">Transfer</Button></CardContent></Card></div></Mainlayout>}
