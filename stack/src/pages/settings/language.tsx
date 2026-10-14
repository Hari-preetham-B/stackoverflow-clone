import Mainlayout from "@/layout/Mainlayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axiosInstance from "@/lib/axiosinstance";
import { useLanguage } from "@/lib/LanguageContext";
import { useState } from "react";
import { toast } from "react-toastify";
const languages=[['en','English'],['es','Spanish'],['hi','Hindi'],['pt','Portuguese'],['zh','Chinese'],['fr','French']];
export default function LanguagePage(){const {setPreferredLanguage}=useLanguage(); const[language,setLanguage]=useState('en');const[otp,setOtp]=useState('');const[sent,setSent]=useState(false);const request=async()=>{try{const r=await axiosInstance.post('/language/request',{language});toast.success(r.data.message);setSent(true)}catch(e:any){toast.error(e.response?.data?.message||'Unable to send OTP')}};const verify=async()=>{try{const r=await axiosInstance.post('/language/verify',{language,otp});toast.success(r.data.message);setPreferredLanguage(language);setSent(false);setOtp('')}catch(e:any){toast.error(e.response?.data?.message||'Invalid OTP')}};return <Mainlayout><div className="max-w-xl mx-auto"><Card><CardHeader><CardTitle>Language</CardTitle></CardHeader><CardContent className="space-y-4"><select className="w-full border rounded p-2" value={language} onChange={e=>{setLanguage(e.target.value);setSent(false)}}>{languages.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><p className="text-sm text-gray-600">French uses email OTP. Spanish, Hindi, Portuguese and Chinese use mobile OTP.</p>{!sent?<Button className="bg-blue-600" onClick={request}>Request OTP</Button>:<><Input inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit OTP"/><Button className="bg-blue-600" onClick={verify}>Verify and change language</Button></>}</CardContent></Card></div></Mainlayout>}
