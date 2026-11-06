import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, CheckCircle2, Clock3, MessageSquare, Pause, Play, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type SessionRow = { id: string; title: string; status: "active" | "paused" | "completed" | "archived"; created_at: string; updated_at: string; mode: string };
type MessageRow = { id: string; speaker: string; content: string; created_at: string };

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = sessions.find((s) => s.id === selectedId) || null;
  const stats = useMemo(() => ({
    total: messages.length,
    user: messages.filter((m) => m.speaker === "user").length,
    chloe: messages.filter((m) => m.speaker === "chloe").length,
    thomas: messages.filter((m) => m.speaker === "thomas").length,
    ines: messages.filter((m) => m.speaker === "ines").length,
  }), [messages]);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("sessions").select("id,title,status,created_at,updated_at,mode").order("updated_at", { ascending: false }).limit(100);
    if (error) setError(error.message);
    else { const rows = (data || []) as SessionRow[]; setSessions(rows); if (!selectedId && rows[0]) setSelectedId(rows[0].id); }
    setLoading(false);
  }
  async function loadMessages(id: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("messages").select("id,speaker,content,created_at").eq("session_id", id).order("created_at", { ascending: true }).limit(500);
    if (error) setError(error.message); else setMessages((data || []) as MessageRow[]);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedId) void loadMessages(selectedId); else setMessages([]); }, [selectedId]);

  async function setStatus(status: SessionRow["status"]) {
    if (!supabase || !selected) return;
    const { error } = await supabase.from("sessions").update({ status, updated_at: new Date().toISOString() }).eq("id", selected.id);
    if (error) setError(error.message);
    else setSessions((items) => items.map((item) => item.id === selected.id ? { ...item, status } : item));
  }

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">PILOTAGE & ANALYSE</span><h1>Sessions & Lab</h1><p>Retrouve tes échanges et observe la dynamique de chaque table ronde.</p></div><span className="module-count">{sessions.length} sessions</span></header>
    {error && <div className="api-error">{error}</div>}
    <div className="sessions-layout"><aside className="sessions-list"><div className="project-list-title">HISTORIQUE</div>{loading ? <p className="module-muted">Chargement…</p> : sessions.length === 0 ? <p className="module-muted">Aucune session enregistrée.</p> : sessions.map((session) => <button className={\`project-list-item \${selectedId === session.id ? "active" : ""}\`} key={session.id} onClick={() => setSelectedId(session.id)}><MessageSquare size={15}/><span><strong>{session.title}</strong><small>{new Date(session.updated_at).toLocaleString("fr-FR")} · {session.status}</small></span></button>)}</aside>
      <div className="session-detail">{selected ? <><div className="session-detail-head"><div><span className="eyebrow">RAPPORT DE SESSION</span><h2>{selected.title}</h2><p><Clock3 size={13}/> Dernière activité : {new Date(selected.updated_at).toLocaleString("fr-FR")}</p></div><select value={selected.status} onChange={(e) => void setStatus(e.target.value as SessionRow["status"])} aria-label="Statut de session"><option value="active">Active</option><option value="paused">En pause</option><option value="completed">Terminée</option><option value="archived">Archivée</option></select></div><div className="session-metrics"><div><MessageSquare size={16}/><strong>{stats.total}</strong><span>Messages</span></div><div><Users size={16}/><strong>3</strong><span>Agents configurés</span></div><div><Activity size={16}/><strong>{stats.user}</strong><span>Interventions utilisateur</span></div></div><h3>Répartition des interventions</h3><div className="agent-stats">{[["Chloé",stats.chloe,"violet"],["Thomas",stats.thomas,"blue"],["Inès",stats.ines,"amber"]].map(([name,count,color]) => <div className="agent-stat" key={String(name)}><span className={\`stat-dot \${color}\`}/><strong>{name}</strong><span>{count} réponses</span></div>)}</div><h3>Fil de conversation</h3><div className="session-transcript">{messages.map((message) => <article key={message.id}><div><strong>{message.speaker === "user" ? "Vous" : message.speaker === "chloe" ? "Chloé" : message.speaker === "thomas" ? "Thomas" : "Inès"}</strong><time>{new Date(message.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.content}</p></article>)}</div></> : <div className="module-empty large"><Archive size={28}/><strong>Sélectionne une session</strong><span>Les statistiques et le fil de discussion apparaîtront ici.</span></div>}</div>
    </div>
  </section>;
}
