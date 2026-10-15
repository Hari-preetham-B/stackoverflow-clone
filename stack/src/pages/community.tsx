import Mainlayout from "@/layout/Mainlayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Link from "next/link";

export default function CommunityPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]); const [notifications, setNotifications] = useState<any[]>([]); const [content, setContent] = useState(""); const [imageUrl, setImageUrl] = useState(""); const [tagFilter, setTagFilter] = useState(""); const [code, setCode] = useState(""); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false); const [trending, setTrending] = useState<any[]>([]);
  const load = async (p=1) => { try { const r = await axiosInstance.get(`/community/feed?page=${p}&limit=10`); setPosts(p===1?r.data.data:[...posts,...r.data.data]); setHasMore(r.data.pagination.hasMore); } catch (e:any) { toast.error(e.response?.data?.message || "Login required"); } };
  // Empty tagFilter means the normal personalised feed; otherwise the dedicated
  // hashtag endpoint, which applies the same pagination envelope.
  const loadByTag = async (tag:string, p=1) => {
    const clean = tag.trim().replace(/^#/,"");
    if (!clean) return load(p);
    try {
      const r = await axiosInstance.get(`/community/posts/hashtag/${encodeURIComponent(clean)}?page=${p}&limit=10`);
      setPosts(p===1?r.data.data:[...posts,...r.data.data]);
      setHasMore(r.data.pagination.hasMore);
    } catch (e:any) { toast.error(e.response?.data?.message || "Could not load hashtag"); }
  };
  const clearTag = () => { setTagFilter(""); load(1); };
  const loadNotifications = async () => { try { const r=await axiosInstance.get("/community/notifications"); setNotifications(r.data.data.slice(0,8)); } catch {} };
  const loadTrending = async () => { try { const r=await axiosInstance.get("/community/trending"); setTrending(r.data.data.slice(0,5)); } catch {} };
  useEffect(()=>{load();loadTrending();loadNotifications();},[]);
  const create = async()=>{if(!content.trim()) return; try{await axiosInstance.post("/community/posts",{content,imageUrl:imageUrl||null,code:code||null});setContent("");setImageUrl("");setCode("");toast.success("Post published");load();}catch(e:any){toast.error(e.response?.data?.message||"Failed to publish")}};
  const action = async (url:string)=>{try{await axiosInstance.post(url);load()}catch(e:any){toast.error(e.response?.data?.message||"Action failed")}};
  const share = async (postId:string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/community#${postId}`); } catch {}
    await action(`/community/posts/${postId}/share`);
    toast.success("Post link copied");
  };
  return <Mainlayout><div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_300px] gap-6"><div className="space-y-4 min-w-0"><Card><CardContent className="p-4 space-y-3"><div className="flex justify-between items-center"><h1 className="text-xl font-semibold">Community</h1><Button variant="outline" onClick={async()=>{try{const r=await axiosInstance.get("/community/exclusive");setPosts(r.data.data)}catch(e:any){toast.error(e.response?.data?.message||"Gold subscription required")}}}>Gold exclusive</Button></div><Textarea placeholder="Share a technical update, project, achievement or code..." value={content} onChange={e=>setContent(e.target.value)} /><Input placeholder="Image URL (optional)" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} /><Textarea placeholder="Code snippet (optional)" value={code} onChange={e=>setCode(e.target.value)} /><Button onClick={create} className="bg-blue-600">Publish</Button></CardContent></Card>{posts.map(p=><Card key={p._id}><CardContent className="p-4 space-y-3"><div className="flex justify-between"><Link href={`/users/${p.authorId?._id}`} className="font-semibold text-blue-600">{p.authorId?.name}</Link><div className="flex gap-2 items-center"><span className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</span>{p.authorId?._id && <Button size="sm" variant="outline" onClick={()=>action(`/community/users/${p.authorId._id}/follow`)}>Follow</Button>}</div></div><p className="whitespace-pre-wrap">{p.content}</p>{p.imageUrl&&<img src={p.imageUrl} alt="post" className="max-w-full max-h-96 rounded border" />}{p.code&&<pre className="bg-gray-900 text-white p-3 rounded overflow-auto text-sm">{p.code}</pre>}{p.comments?.length>0&&<div className="space-y-2">{p.comments.map((c:any)=><div key={c._id} className="bg-gray-50 p-2 rounded text-sm"><p>{c.text}</p><Button size="sm" variant="ghost" onClick={()=>{const text=window.prompt("Reply");if(text)axiosInstance.post(`/community/posts/${p._id}/comments/${c._id}/replies`,{text}).then(()=>load())}}>Reply</Button>{c.replies?.map((r:any)=><div key={r._id} className="ml-4 border-l pl-2 text-xs">{r.text}</div>)}</div>)}</div>}<div className="flex gap-2 flex-wrap"><Button size="sm" variant="outline" onClick={()=>action(`/community/posts/${p._id}/like`)}>Like ({p.likes?.length||0})</Button><Button size="sm" variant="outline" onClick={()=>{const text=window.prompt("Comment");if(text)axiosInstance.post(`/community/posts/${p._id}/comments`,{text}).then(()=>load())}}>Comment ({p.comments?.length||0})</Button><Button size="sm" variant="outline" onClick={()=>share(p._id)}>Share ({p.shares||0})</Button><Button size="sm" variant="outline" onClick={()=>action(`/community/posts/${p._id}/bookmark`)}>Bookmark</Button>{user?._id===p.authorId?._id&&<><Button size="sm" variant="outline" onClick={async()=>{const text=window.prompt("Edit post",p.content);if(text){await axiosInstance.patch(`/community/posts/${p._id}`,{content:text});load()}}}>Edit</Button><Button size="sm" variant="outline" onClick={()=>axiosInstance.delete(`/community/posts/${p._id}`).then(()=>load())}>Delete</Button></>}<Button size="sm" variant="outline" onClick={()=>{const reason=window.prompt("Report reason");if(reason)axiosInstance.post(`/community/posts/${p._id}/report`,{reason}).then(()=>toast.success("Reported"))}}>Report</Button></div></CardContent></Card>)}{hasMore&&<Button onClick={()=>{const n=page+1;setPage(n);load(n)}}>Load more</Button>}</div><aside className="space-y-4 min-w-0"><Card><CardContent className="p-4"><h2 className="font-semibold mb-3">Notifications</h2>{notifications.map((n:any)=><p key={n._id} className="text-xs border-b py-2">{n.message}</p>)}</CardContent></Card><Card><CardContent className="p-4"><h2 className="font-semibold mb-3">Filter by hashtag</h2><div className="flex gap-2"><Input placeholder="#Python" value={tagFilter} onChange={e=>setTagFilter(e.target.value)} /><Button variant="outline" size="sm" onClick={()=>loadByTag(tagFilter,1)}>Apply</Button></div>{tagFilter && <Button variant="ghost" size="sm" className="mt-2" onClick={clearTag}>Clear #filter</Button>}</CardContent></Card><Card><CardContent className="p-4"><h2 className="font-semibold mb-3">Trending</h2>{trending.map(p=><Link key={p._id} href={`/community#${p._id}`} className="block text-sm border-b py-2">{p.content.slice(0,80)}</Link>)}</CardContent></Card></aside></div></Mainlayout>;
}
