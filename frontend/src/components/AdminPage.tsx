import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Server, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type Health = { status: string; service: string; ai_configured: boolean; auth_configured: boolean };

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  async function check() {
    if (!supabase) { setError("Supabase non configuré."); setChecking(false); return; }
    setChecking(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setChecking(false); return; }
    const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", auth.user.id).maybeSingle();
    if (roleError) { setError(roleError.message); setChecking(false); return; }
    if (role?.role !== "admin") { setIsAdmin(false); setChecking(false); return; }
    setIsAdmin(true);
    try {
      const response = await fetch("/health");
      if (!response.ok) throw new Error("API indisponible.");
      setHealth(await response.json() as Health);
    } catch (e) { setError(e instanceof Error ? e.message : "Diagnostic impossible."); }
    setChecking(false);
  }
  useEffect(() => { void check(); }, []);

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">CONTRÔLE SYSTÈME</span><h1>Administration</h1><p>Accès protégé par un rôle administrateur attribué côté serveur.</p></div><span className="module-count">Accès restreint</span></header>
    {checking ? <div className="module-empty large">Vérification des autorisations…</div> : !isAdmin ? <div className="admin-denied"><ShieldAlert size={27}/><strong>Accès administrateur requis</strong><p>Ton compte ne possède pas le rôle admin. Le rôle ne peut pas être attribué depuis le navigateur ; un administrateur doit l'ajouter côté serveur ou dans la console Supabase.</p></div> : <><div className="admin-top"><div><span className="eyebrow">DIAGNOSTIC EN DIRECT</span><h2>État des services</h2></div><button className="outline-button" onClick={() => void check()}><Activity size={14}/> Actualiser</button></div>{error && <div className="api-error">{error}</div>}<div className="admin-health-grid"><div className="admin-health-card"><Server size={18}/><strong>API Rust</strong><span>{health?.status === "ok" ? "Disponible" : "Non vérifiée"}</span>{health?.status === "ok" ? <CheckCircle2 size={16} className="health-good"/> : <XCircle size={16} className="health-bad"/>}</div><div className="admin-health-card"><Activity size={18}/><strong>Gemini</strong><span>{health?.ai_configured ? "Clé configurée" : "Clé absente"}</span>{health?.ai_configured ? <CheckCircle2 size={16} className="health-good"/> : <XCircle size={16} className="health-bad"/>}</div><div className="admin-health-card"><ShieldAlert size={18}/><strong>Supabase Auth</strong><span>{health?.auth_configured ? "Configuré" : "Configuration absente"}</span>{health?.auth_configured ? <CheckCircle2 size={16} className="health-good"/> : <XCircle size={16} className="health-bad"/>}</div></div><p className="admin-note">Cette première console est en lecture seule. La gestion des comptes, rôles, quotas, modèles, clés, journaux et paramètres globaux sera ajoutée avec des endpoints administratifs dédiés.</p></>}
  </section>;
}
