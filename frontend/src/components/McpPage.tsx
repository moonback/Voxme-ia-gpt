import { useEffect, useState, type FormEvent } from "react";
import { Command, Plus, Radio, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type ServerRow = { id: string; name: string; endpoint: string; transport: string; enabled: boolean; created_at: string };

export default function McpPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("mcp_servers").select("id,name,endpoint,transport,enabled,created_at").order("created_at", { ascending: false });
    if (error) setError(error.message); else setServers((data || []) as ServerRow[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function addServer(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim() || !endpoint.trim()) return;
    let parsed: URL;
    try { parsed = new URL(endpoint.trim()); } catch { setError("Adresse MCP invalide."); return; }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
      setError("Utilise HTTPS. HTTP est autorisé uniquement pour localhost en développement."); return;
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      setError("Ne place pas de secret dans l'URL. L'authentification dédiée sera ajoutée au gestionnaire de connexions."); return;
    }
    setBusy(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setBusy(false); return; }
    const { data, error } = await supabase.from("mcp_servers").insert({ user_id: auth.user.id, name: name.trim(), endpoint: parsed.toString(), transport: "streamable_http", enabled: false }).select("id,name,endpoint,transport,enabled,created_at").single();
    if (error) setError(error.message); else if (data) { setServers((items) => [data as ServerRow, ...items]); setName(""); setEndpoint(""); }
    setBusy(false);
  }

  async function toggle(server: ServerRow) {
    if (!supabase) return;
    const { error } = await supabase.from("mcp_servers").update({ enabled: !server.enabled }).eq("id", server.id);
    if (error) setError(error.message); else setServers((items) => items.map((item) => item.id === server.id ? { ...item, enabled: !server.enabled } : item));
  }

  async function remove(server: ServerRow) {
    if (!supabase || !window.confirm(`Supprimer le serveur « ${server.name} » ?`)) return;
    const { error } = await supabase.from("mcp_servers").delete().eq("id", server.id);
    if (error) setError(error.message); else setServers((items) => items.filter((item) => item.id !== server.id));
  }

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">INTÉGRATIONS PERSONNELLES</span><h1>Serveurs MCP</h1><p>Référence tes serveurs MCP privés et prépare leur gouvernance par permissions.</p></div><span className="module-count">{servers.length} serveurs</span></header>
    {error && <div className="api-error">{error}</div>}
    <div className="mcp-warning"><Command size={17}/><p><strong>Registre de connexions — exécution non activée.</strong> Cette version enregistre les endpoints et leur état. La découverte des outils, l'authentification des serveurs, l'exécution isolée et les autorisations par outil seront ajoutées avant toute invocation.</p></div>
    <form className="mcp-create" onSubmit={addServer}><div className="compose-heading"><Plus size={17}/><strong>Ajouter un serveur MCP</strong></div><div className="mcp-fields"><label>Nom du serveur<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon serveur documentaire"/></label><label>Endpoint Streamable HTTP<input type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://mcp.exemple.fr/mcp"/></label></div><button className="primary-button" disabled={busy || !name.trim() || !endpoint.trim()}><Plus size={15}/>{busy ? "Ajout…" : "Enregistrer le serveur"}</button></form>
    <div className="mcp-list">{loading ? <p className="module-muted">Chargement…</p> : servers.length ? servers.map((server) => <article className="mcp-server" key={server.id}><div className="mcp-server-icon"><Radio size={17}/></div><div className="mcp-server-info"><strong>{server.name}</strong><code>{server.endpoint}</code><small>Streamable HTTP · {server.enabled ? "Activé dans le registre" : "Désactivé"}</small></div><button className={server.enabled ? "mcp-toggle enabled" : "mcp-toggle"} onClick={() => void toggle(server)}>{server.enabled ? "Activé" : "Désactivé"}</button><button className="danger-icon" onClick={() => void remove(server)} aria-label="Supprimer"><Trash2 size={15}/></button></article>) : <div className="module-empty large"><Command size={28}/><strong>Aucun serveur MCP</strong><span>Ajoute un endpoint pour commencer à constituer ton registre.</span></div>}</div>
  </section>;
}
