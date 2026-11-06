import { useEffect, useState, type FormEvent } from "react";
import { Archive, Check, FolderKanban, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type Project = { id: string; title: string; description: string; status: "active" | "paused" | "completed" | "archived"; updated_at: string };

export default function StudioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = projects.find((project) => project.id === selectedId) || null;

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("projects").select("id,title,description,status,updated_at").order("updated_at", { ascending: false });
    if (error) setError(error.message);
    else {
      const rows = (data || []) as Project[];
      setProjects(rows);
      if (!selectedId && rows[0]) { setSelectedId(rows[0].id); setTitle(rows[0].title); setDescription(rows[0].description); }
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function selectProject(project: Project) {
    setSelectedId(project.id); setTitle(project.title); setDescription(project.description); setError("");
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !newTitle.trim()) return;
    setBusy(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setBusy(false); return; }
    const { data, error } = await supabase.from("projects").insert({ user_id: auth.user.id, title: newTitle.trim() }).select("id,title,description,status,updated_at").single();
    if (error) setError(error.message);
    else if (data) { const project = data as Project; setProjects((items) => [project, ...items]); selectProject(project); setNewTitle(""); }
    setBusy(false);
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !selectedId || !title.trim()) return;
    setBusy(true); setError("");
    const { data, error } = await supabase.from("projects").update({ title: title.trim(), description, updated_at: new Date().toISOString() }).eq("id", selectedId).select("id,title,description,status,updated_at").single();
    if (error) setError(error.message);
    else if (data) setProjects((items) => items.map((item) => item.id === selectedId ? data as Project : item));
    setBusy(false);
  }

  async function changeStatus(status: Project["status"]) {
    if (!supabase || !selectedId) return;
    const { error } = await supabase.from("projects").update({ status, updated_at: new Date().toISOString() }).eq("id", selectedId);
    if (error) setError(error.message);
    else setProjects((items) => items.map((item) => item.id === selectedId ? { ...item, status } : item));
  }

  async function deleteProject() {
    if (!supabase || !selectedId || !window.confirm("Supprimer définitivement ce projet ?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", selectedId);
    if (error) { setError(error.message); return; }
    const remaining = projects.filter((item) => item.id !== selectedId);
    setProjects(remaining); setSelectedId(remaining[0]?.id || null);
    setTitle(remaining[0]?.title || ""); setDescription(remaining[0]?.description || "");
  }

  return <section className="module-page">
    <header className="module-header"><div><span className="eyebrow">ESPACE DE CRÉATION</span><h1>Studio</h1><p>Transforme tes réflexions en projets, documents et livrables concrets.</p></div><span className="module-count">{projects.length} projet{projects.length > 1 ? "s" : ""}</span></header>
    {error && <div className="api-error" role="alert">{error}</div>}
    <div className="studio-layout">
      <aside className="project-list-panel">
        <form className="create-project" onSubmit={createProject}><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nom du nouveau projet" aria-label="Nom du nouveau projet"/><button disabled={busy || !newTitle.trim()} aria-label="Créer un projet"><Plus size={16}/></button></form>
        <div className="project-list-title">MES PROJETS</div>
        {loading ? <p className="module-muted">Chargement…</p> : projects.length === 0 ? <div className="module-empty"><FolderKanban size={22}/><strong>Aucun projet</strong><span>Crée ton premier espace de travail.</span></div> : projects.map((project) => <button key={project.id} className={`project-list-item ${selectedId === project.id ? "active" : ""}`} onClick={() => selectProject(project)}><FolderKanban size={16}/><span><strong>{project.title}</strong><small>{project.status === "active" ? "En cours" : project.status === "completed" ? "Terminé" : project.status === "paused" ? "En pause" : "Archivé"}</small></span></button>)}
      </aside>
      <div className="project-editor">
        {selected ? <form onSubmit={saveProject}><div className="editor-top"><span className="eyebrow">FICHE PROJET</span><div className="editor-actions"><select value={selected.status} onChange={(e) => void changeStatus(e.target.value as Project["status"])} aria-label="Statut du projet"><option value="active">En cours</option><option value="paused">En pause</option><option value="completed">Terminé</option><option value="archived">Archivé</option></select><button type="button" className="danger-icon" onClick={() => void deleteProject()} aria-label="Supprimer"><Trash2 size={16}/></button></div></div><input className="project-title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre du projet"/><label className="editor-label">Description et notes<textarea rows={12} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Objectif, contexte, public cible, contraintes, idées, prochaines étapes…"/></label><div className="editor-bottom"><span>Enregistré dans ton espace privé</span><button className="primary-button" disabled={busy || !title.trim()}><Save size={15}/>{busy ? "Enregistrement…" : "Enregistrer"}</button></div></form> : <div className="module-empty large"><FolderKanban size={30}/><strong>Sélectionne ou crée un projet</strong><span>Chaque projet possède son espace de notes et de suivi.</span></div>}
      </div>
    </div>
  </section>;
}
