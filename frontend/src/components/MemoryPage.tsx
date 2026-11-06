import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Brain, Check, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type Memory = { id: string; category: string; content: string; is_validated: boolean; expires_at: string | null; created_at: string };
const categories = ["Préférence", "Projet", "Objectif", "Décision", "Contexte", "À vérifier"];

export default function MemoryPage() {
  const [items, setItems] = useState<Memory[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("memories").select("id,category,content,is_validated,expires_at,created_at").order("created_at", { ascending: false });
    if (error) setError(error.message); else setItems((data || []) as Memory[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => items.filter((item) => (item.content + " " + item.category).toLowerCase().includes(query.toLowerCase())), [items, query]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !content.trim()) return;
    setBusy(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setBusy(false); return; }
    const { data, error } = await supabase.from("memories").insert({ user_id: auth.user.id, category, content: content.trim(), is_validated: false }).select("id,category,content,is_validated,expires_at,created_at").single();
    if (error) setError(error.message); else if (data) { setItems((old) => [data as Memory, ...old]); setContent(""); }
    setBusy(false);
  }
  async function validate(item: Memory) {
    if (!supabase) return;
    const { error } = await supabase.from("memories").update({ is_validated: !item.is_validated }).eq("id", item.id);
    if (error) setError(error.message); else setItems((old) => old.map((m) => m.id === item.id ? { ...m, is_validated: !m.is_validated } : m));
  }
  async function remove(item: Memory) {
    if (!supabase || !window.confirm("Supprimer cette mémoire ?")) return;
    const { error } = await supabase.from("memories").delete().eq("id", item.id);
    if (error) setError(error.message); else setItems((old) => old.filter((m) => m.id !== item.id));
  }
  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">MÉMOIRE PERSONNELLE</span><h1>Mémoire sélective</h1><p>Tu décides ce que VOXME conserve, valide et réutilise.</p></div><span className="module-count">{items.length} éléments</span></header>
    {error && <div className="api-error">{error}</div>}
    <form className="memory-create" onSubmit={add}><div className="memory-create-head"><Brain size={18}/><strong>Ajouter un souvenir</strong><span>Non validé par défaut</span></div><div className="memory-form-row"><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select><textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Une information utile à retenir, avec son contexte…"/></div><div className="memory-submit"><span>La mémoire ne devient active qu'après ta validation.</span><button className="primary-button" disabled={busy || !content.trim()}><Plus size={15}/>Ajouter</button></div></form>
    <div className="memory-toolbar"><strong>Souvenirs enregistrés</strong><label><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans la mémoire"/></label></div>
    {loading ? <p className="module-muted">Chargement…</p> : filtered.length === 0 ? <div className="module-empty large"><Brain size={28}/><strong>Aucun souvenir trouvé</strong><span>Ajoute une information ou modifie ta recherche.</span></div> : <div className="memory-list">{filtered.map((item) => <article className="memory-item" key={item.id}><div className="memory-item-main"><span className="memory-category">{item.category}</span><p>{item.content}</p><small>{new Date(item.created_at).toLocaleDateString("fr-FR")}</small></div><div className="memory-item-actions"><button className={item.is_validated ? "memory-validated" : "memory-pending"} onClick={() => void validate(item)}><Check size={14}/>{item.is_validated ? "Validée" : "Valider"}</button><button className="danger-icon" onClick={() => void remove(item)} aria-label="Supprimer"><Trash2 size={15}/></button></div></article>)}</div>}
  </section>;
}
