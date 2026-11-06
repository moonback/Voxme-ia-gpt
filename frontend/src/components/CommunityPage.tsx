import { useEffect, useState, type FormEvent } from "react";
import { Heart, MessageCircle, Plus, Send, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type Post = { id: string; user_id: string; title: string; body: string; created_at: string; reactions: number; reacted: boolean };
type Comment = { id: string; user_id: string; body: string; created_at: string };

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = posts.find((post) => post.id === selectedId) || null;

  async function loadPosts() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("community_posts").select("id,user_id,title,body,created_at").eq("visibility", "public").order("created_at", { ascending: false }).limit(50);
    if (error) { setError(error.message); return; }
    const rows = data || [];
    const ids = rows.map((post) => post.id);
    const { data: reactions } = ids.length ? await supabase.from("community_reactions").select("post_id,user_id").in("post_id", ids) : { data: [] };
    const counts = new Map<string, number>();
    const reacted = new Set<string>();
    for (const reaction of reactions || []) {
      counts.set(reaction.post_id, (counts.get(reaction.post_id) || 0) + 1);
      if (reaction.user_id === auth.user?.id) reacted.add(reaction.post_id);
    }
    const mapped = rows.map((post) => ({ ...post, reactions: counts.get(post.id) || 0, reacted: reacted.has(post.id) })) as Post[];
    setPosts(mapped);
    if (!selectedId && mapped[0]) setSelectedId(mapped[0].id);
    if (selectedId && !mapped.some((post) => post.id === selectedId)) setSelectedId(mapped[0]?.id || null);
  }

  async function loadComments(postId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("community_comments").select("id,user_id,body,created_at").eq("post_id", postId).order("created_at", { ascending: true });
    if (error) setError(error.message); else setComments((data || []) as Comment[]);
  }

  useEffect(() => { void loadPosts(); }, []);
  useEffect(() => { if (selectedId) void loadComments(selectedId); else setComments([]); }, [selectedId]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !title.trim() || !body.trim()) return;
    setBusy(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setBusy(false); return; }
    const { data, error } = await supabase.from("community_posts").insert({ user_id: auth.user.id, title: title.trim(), body: body.trim(), visibility: "public" }).select("id,user_id,title,body,created_at").single();
    if (error) setError(error.message);
    else if (data) { setTitle(""); setBody(""); setPosts((items) => [{ ...data, reactions: 0, reacted: false } as Post, ...items]); setSelectedId(data.id); }
    setBusy(false);
  }

  async function toggleReaction(post: Post) {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const query = supabase.from("community_reactions");
    const result = post.reacted
      ? await query.delete().eq("post_id", post.id).eq("user_id", auth.user.id).eq("kind", "insightful")
      : await query.insert({ post_id: post.id, user_id: auth.user.id, kind: "insightful" });
    if (result.error) setError(result.error.message);
    else setPosts((items) => items.map((item) => item.id === post.id ? { ...item, reacted: !post.reacted, reactions: Math.max(0, item.reactions + (post.reacted ? -1 : 1)) } : item));
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !selected || !comment.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); return; }
    const { data, error } = await supabase.from("community_comments").insert({ post_id: selected.id, user_id: auth.user.id, body: comment.trim() }).select("id,user_id,body,created_at").single();
    if (error) setError(error.message); else if (data) { setComments((items) => [...items, data as Comment]); setComment(""); }
  }

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">ESPACE COLLECTIF</span><h1>Communauté</h1><p>Partage des idées, confronte les points de vue et échange avec les membres.</p></div><span className="module-count"><Users size={12}/> {posts.length} discussions</span></header>
    {error && <div className="api-error">{error}</div>}
    <form className="community-compose" onSubmit={publish}><div className="compose-heading"><Users size={17}/><strong>Lancer une discussion publique</strong><span>Visible par les membres</span></div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quel sujet veux-tu ouvrir ?" maxLength={180}/><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Présente ton idée, ta question ou ton dilemme…" rows={3} maxLength={12000}/><button className="primary-button" disabled={busy || !title.trim() || !body.trim()}><Plus size={15}/>{busy ? "Publication…" : "Publier la discussion"}</button></form>
    <div className="community-layout"><div className="community-feed">{posts.length ? posts.map((post) => <article className={`community-post ${selectedId === post.id ? "selected" : ""}`} key={post.id}><button className="post-select" onClick={() => setSelectedId(post.id)}><span className="post-author">Membre VOXME · {new Date(post.created_at).toLocaleDateString("fr-FR")}</span><strong>{post.title}</strong><p>{post.body}</p></button><div className="post-actions"><button className={post.reacted ? "reacted" : ""} onClick={() => void toggleReaction(post)}><Heart size={14}/>{post.reactions}</button><button onClick={() => setSelectedId(post.id)}><MessageCircle size={14}/>Discuter</button></div></article>) : <div className="module-empty large"><Users size={28}/><strong>La communauté commence ici</strong><span>Ouvre la première discussion publique.</span></div>}</div>
      <aside className="community-discussion">{selected ? <><span className="eyebrow">DISCUSSION SÉLECTIONNÉE</span><h2>{selected.title}</h2><p className="discussion-body">{selected.body}</p><div className="comments-heading"><strong>Commentaires</strong><span>{comments.length}</span></div><div className="comments-list">{comments.map((item) => <article className="community-comment" key={item.id}><small>Membre VOXME · {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small><p>{item.body}</p></article>)}</div><form className="comment-form" onSubmit={sendComment}><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ajouter un commentaire…"/><button disabled={!comment.trim()} aria-label="Envoyer"><Send size={15}/></button></form></> : <div className="module-empty"><MessageCircle size={24}/><strong>Choisis une discussion</strong><span>Les commentaires apparaîtront ici.</span></div>}</aside>
    </div>
  </section>;
}
