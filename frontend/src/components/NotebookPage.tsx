import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { BookOpen, FileText, FolderPlus, LoaderCircle, Plus, Trash2, UploadCloud } from "lucide-react";
import { supabase } from "../lib/supabase";

type Notebook = { id: string; name: string; description: string | null };
type DocumentRow = { id: string; notebook_id: string; filename: string; mime_type: string | null; status: string; created_at: string; storage_path: string | null };
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export default function NotebookPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const selected = notebooks.find((n) => n.id === selectedId) || null;

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("notebooks").select("id,name,description").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else { const rows = (data || []) as Notebook[]; setNotebooks(rows); if (!selectedId && rows[0]) setSelectedId(rows[0].id); }
    setLoading(false);
  }
  async function loadDocuments(notebookId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("documents").select("id,notebook_id,filename,mime_type,status,created_at,storage_path").eq("notebook_id", notebookId).order("created_at", { ascending: false });
    if (error) setError(error.message); else setDocuments((data || []) as DocumentRow[]);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedId) void loadDocuments(selectedId); else setDocuments([]); }, [selectedId]);

  async function createNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !newName.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); return; }
    const { data, error } = await supabase.from("notebooks").insert({ user_id: auth.user.id, name: newName.trim() }).select("id,name,description").single();
    if (error) setError(error.message);
    else if (data) { setNotebooks((old) => [data as Notebook, ...old]); setSelectedId(data.id); setNewName(""); }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase || !selectedId) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Session expirée.");
      for (const file of files) {
        if (!ACCEPTED.includes(file.type) && !file.name.toLowerCase().endsWith(".md")) throw new Error(`Format non pris en charge : ${file.name}`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} dépasse la limite de 25 Mo.`);
        const path = `${auth.user.id}/${selectedId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("voxme-documents").upload(path, file, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { error: rowError } = await supabase.from("documents").insert({ notebook_id: selectedId, user_id: auth.user.id, filename: file.name, storage_path: path, mime_type: file.type || "text/markdown", status: "pending" });
        if (rowError) { await supabase.storage.from("voxme-documents").remove([path]); throw new Error(rowError.message); }
      }
      await loadDocuments(selectedId);
    } catch (e) { setError(e instanceof Error ? e.message : "Import impossible."); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function removeDocument(doc: DocumentRow) {
    if (!supabase || !window.confirm(`Supprimer « ${doc.filename} » ?`)) return;
    if (doc.storage_path) await supabase.storage.from("voxme-documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) setError(error.message); else setDocuments((old) => old.filter((d) => d.id !== doc.id));
  }

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">BASE DE CONNAISSANCES</span><h1>Notebook</h1><p>Centralise tes sources et prépare une base documentaire pour les agents.</p></div><span className="module-count">{documents.length} document{documents.length > 1 ? "s" : ""}</span></header>
    {error && <div className="api-error">{error}</div>}
    <div className="notebook-layout"><aside className="notebook-sidebar"><form className="create-project" onSubmit={(e) => void createNotebook(e)}><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouvelle collection" aria-label="Nom de la collection"/><button disabled={!newName.trim()}><FolderPlus size={15}/></button></form><div className="project-list-title">COLLECTIONS</div>{loading ? <p className="module-muted">Chargement…</p> : notebooks.map((n) => <button className={`project-list-item ${selectedId === n.id ? "active" : ""}`} key={n.id} onClick={() => setSelectedId(n.id)}><BookOpen size={15}/><span><strong>{n.name}</strong><small>Collection privée</small></span></button>)}</aside>
      <div className="notebook-content">{selected ? <><div className="notebook-content-head"><div><span className="eyebrow">COLLECTION</span><h2>{selected.name}</h2></div><label className="upload-button"><UploadCloud size={15}/>{uploading ? "Import…" : "Importer des fichiers"}<input type="file" multiple accept=".pdf,.txt,.md,.docx" onChange={(e) => void uploadFiles(e)} disabled={uploading}/></label></div><p className="notebook-notice">Formats acceptés : PDF, DOCX, TXT, Markdown · 25 Mo maximum par fichier. L'extraction du texte, l'indexation vectorielle et les réponses RAG seront activées dans la prochaine étape.</p><div className="document-list">{documents.length ? documents.map((doc) => <article className="document-item" key={doc.id}><FileText size={18}/><span><strong>{doc.filename}</strong><small>{doc.mime_type || "Document"} · {new Date(doc.created_at).toLocaleDateString("fr-FR")}</small></span><span className="document-status">{doc.status === "ready" ? "Indexé" : doc.status === "failed" ? "Échec" : "À traiter"}</span><button className="danger-icon" onClick={() => void removeDocument(doc)} aria-label="Supprimer"><Trash2 size={14}/></button></article>) : <div className="module-empty"><BookOpen size={25}/><strong>Cette collection est vide</strong><span>Importe tes premières sources.</span></div>}</div></> : <div className="module-empty large"><BookOpen size={28}/><strong>Crée une collection</strong><span>Organise tes documents par sujet, projet ou domaine.</span></div>}</div>
    </div>
  </section>;
}
