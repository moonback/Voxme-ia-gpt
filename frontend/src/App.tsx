import { useMemo, useState } from "react";
import { Activity, ArrowUp, BookOpen, Brain, Check, ChevronDown, CircleHelp, Command, FileText, Headphones, LayoutDashboard, Library, Menu, Mic, Plus, Settings, Shield, Sparkles, Square, Users, WandSparkles, X } from "lucide-react";
import { isSupabaseConfigured } from "./lib/supabase";

type Agent = "Chloé" | "Thomas" | "Inès";
type Message = { id: number; agent: Agent | "Vous"; text: string; time: string };

const agents = [
  { name: "Chloé" as const, role: "Vision & animation", color: "violet", initials: "C" },
  { name: "Thomas" as const, role: "Contradiction", color: "blue", initials: "T" },
  { name: "Inès" as const, role: "Synthèse & décision", color: "amber", initials: "I" },
];

const initialMessages: Message[] = [
  { id: 1, agent: "Chloé", text: "Bienvenue dans VOXME. Présente ton idée ou ton problème : nous allons l'examiner sous trois angles complémentaires.", time: "09:41" },
  { id: 2, agent: "Thomas", text: "Je chercherai les hypothèses fragiles, les risques et les objections utiles. Mon rôle n'est pas de contredire pour contredire.", time: "09:41" },
  { id: 3, agent: "Inès", text: "Je garderai le fil des arguments et distinguerai les faits, les hypothèses et les décisions que tu valides.", time: "09:41" },
];

const nav = [
  { label: "Conversation", icon: Headphones, active: true },
  { label: "Studio", icon: WandSparkles },
  { label: "Accompagnements", icon: Sparkles },
  { label: "Communauté", icon: Users },
  { label: "Mémoire", icon: Brain },
  { label: "Notebook", icon: BookOpen },
  { label: "Sessions & Lab", icon: Activity },
  { label: "Serveurs MCP", icon: Command },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Nouvelle réflexion");
  const [activeNav, setActiveNav] = useState("Conversation");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [apiError, setApiError] = useState("");
  const [showDecision, setShowDecision] = useState(false);
  const [decisions, setDecisions] = useState<string[]>([]);
  const status = useMemo(() => isSupabaseConfigured ? "Supabase configuré" : "Mode aperçu · Supabase à configurer", []);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || thinking) return;
    const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const history = messages.map((m) => `${m.agent}: ${m.text}`).join("\\n").slice(-7000);
    setMessages((items) => [...items, { id: Date.now(), agent: "Vous", text, time: now() }]);
    setDraft("");
    setApiError("");
    setThinking(true);
    setSessionTitle(text.length > 42 ? text.slice(0, 42) + "…" : text);
    try {
      let context = history + "\\nVous: " + text;
      for (const agent of ["Chloé", "Thomas", "Inès"] as const) {
        const response = await fetch("/api/debate/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, agent, context }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Erreur API (${response.status})`);
        const answer = String(payload.text || "").trim();
        setMessages((items) => [...items, { id: Date.now() + Math.random(), agent, text: answer, time: now() }]);
        context += `\\n${agent}: ${answer}`;
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de contacter le backend VOXME.");
    } finally {
      setThinking(false);
    }
  }

  function addDecision() {
    const decision = window.prompt("Quelle décision souhaites-tu enregistrer ?");
    if (decision?.trim()) setDecisions((items) => [...items, decision.trim()]);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><WandSparkles size={19} /></div><span>VOXME</span><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fermer"><X size={18}/></button></div>
        <button className="new-session" onClick={() => { setMessages(initialMessages); setSessionTitle("Nouvelle réflexion"); setDecisions([]); }}><Plus size={17}/> Nouvelle session <span>⌘ K</span></button>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav>{nav.map(({ label, icon: Icon, active }) => <button key={label} className={`nav-item ${activeNav === label ? "selected" : ""}`} onClick={() => { setActiveNav(label); setMobileMenu(false); }}><Icon size={17}/><span>{label}</span>{label === "Conversation" && <i className="live-dot"/>}</button>)}</nav>
        <div className="sidebar-spacer"/>
        <div className="nav-label">SYSTÈME</div>
        <button className="nav-item" onClick={() => setActiveNav("Administration")}><Shield size={17}/><span>Administration</span></button>
        <button className="nav-item" onClick={() => setActiveNav("Paramètres")}><Settings size={17}/><span>Paramètres</span></button>
        <div className="profile"><div className="profile-avatar">M</div><div><strong>Mon espace</strong><small>Workspace personnel</small></div><ChevronDown size={15}/></div>
      </aside>

      {mobileMenu && <button className="scrim" aria-label="Fermer le menu" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Ouvrir le menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><span className="connection"><i/> {status}</span><button className="icon-button" aria-label="Aide"><CircleHelp size={18}/></button></div></header>
        {activeNav === "Conversation" ? (
          <div className="workspace">
            <section className="conversation-column">
              <div className="session-heading"><div><div className="eyebrow"><span className="live-pill"><i/> SESSION</span><span>•</span><span>Privée</span></div><h1>{sessionTitle}</h1><p>Une table ronde pour penser mieux, ensemble.</p></div><button className="outline-button" onClick={() => setShowDecision(true)}><LayoutDashboard size={16}/> Tableau de session</button></div>
              <div className="agent-row">{agents.map((agent) => <div className="agent-card" key={agent.name}><div className={`agent-avatar ${agent.color}`}>{agent.initials}<span/></div><div><strong>{agent.name}</strong><small>{agent.role}</small></div><span className="agent-status">Prête</span></div>)}</div>
              <div className="conversation-feed">\n                {apiError && <div className="api-error" role="alert">{apiError} — vérifie que le backend Rust est lancé et que GEMINI_API_KEY est configurée.</div>}
                <div className="feed-date">AUJOURD'HUI · DÉBUT DE SESSION</div>
                {messages.map((message) => <article className={`message ${message.agent === "Vous" ? "user-message" : ""}`} key={message.id}><div className={`message-avatar ${message.agent === "Vous" ? "you" : agents.find(a => a.name === message.agent)?.color}`}>{message.agent === "Vous" ? "M" : message.agent[0]}</div><div className="message-body"><div className="message-meta"><strong>{message.agent}</strong><time>{message.time}</time></div><p>{message.text}</p></div></article>)}
                {messages.length === initialMessages.length && <div className="starter-prompts"><button onClick={() => setDraft("Aide-moi à évaluer cette idée : ")}>Évaluer une idée <ArrowUp size={13}/></button><button onClick={() => setDraft("Challenge mon plan et trouve ses angles morts : ")}>Challenger un plan <ArrowUp size={13}/></button><button onClick={() => setDraft("Aide-moi à prendre une décision entre : ")}>Prendre une décision <ArrowUp size={13}/></button></div>}
              </div>
              <div className="composer-wrap"><div className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Présente ton idée, pose une question ou expose un dilemme…" rows={2}/><div className="composer-actions"><div><button className={`icon-button mic-button ${listening ? "recording" : ""}`} onClick={() => setListening(v => !v)} title="Activer le mode vocal (interface en préparation)"><Mic size={17}/></button><span className="composer-hint">Entrée pour envoyer · Maj + Entrée pour une ligne</span></div><button className="send-button" onClick={sendMessage} disabled={!draft.trim() || thinking}><ArrowUp size={17}/></button></div></div><div className="composer-foot"><span><Shield size={12}/> Tes échanges restent privés</span><span>Les décisions restent sous ton contrôle</span></div></div>
            </section>
            <aside className="insight-panel"><div className="panel-title"><div><span className="eyebrow">ESPACE DE RÉFLEXION</span><h2>En un coup d'œil</h2></div><button className="icon-button"><FileText size={17}/></button></div><div className="insight-card focus-card"><span className="card-kicker"><Sparkles size={13}/> FIL CONDUCTEUR</span><h3>Fais émerger la bonne question.</h3><p>Expose ton sujet pour que les trois regards puissent commencer à le confronter.</p></div><div className="panel-section"><div className="section-heading"><strong>Décisions</strong><button onClick={addDecision}><Plus size={15}/> Ajouter</button></div>{decisions.length === 0 ? <div className="empty-state"><Check size={16}/><span>Aucune décision validée pour le moment.</span></div> : decisions.map((d, i) => <div className="decision-item" key={i}><Check size={15}/><span>{d}</span></div>)}</div><div className="panel-section"><div className="section-heading"><strong>À explorer</strong><span className="muted-count">3 pistes</span></div><div className="explore-item"><span className="explore-dot violet-dot"/><span>Hypothèses à vérifier</span></div><div className="explore-item"><span className="explore-dot blue-dot"/><span>Risques et objections</span></div><div className="explore-item"><span className="explore-dot amber-dot"/><span>Prochaines actions</span></div></div><div className="panel-footer"><Library size={15}/><span>Les notes détaillées seront accessibles dans le Notebook.</span></div></aside>
          </div>
        ) : (
          <section className="module-placeholder"><div className="placeholder-icon"><WandSparkles size={26}/></div><span className="eyebrow">VOXME WORKSPACE</span><h1>{activeNav}</h1><p>Ce module est prévu dans l'architecture VOXME. Son implémentation fonctionnelle sera ajoutée dans les prochaines phases.</p><button className="outline-button" onClick={() => setActiveNav("Conversation")}>Retourner à la conversation</button></section>
        )}
      </main>
      {showDecision && <div className="modal-backdrop" onClick={() => setShowDecision(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SESSION</span><h2>Tableau de session</h2></div><button className="icon-button" onClick={() => setShowDecision(false)}><X size={18}/></button></div><div className="metric-grid"><div><strong>{messages.length}</strong><span>Messages</span></div><div><strong>3</strong><span>Agents</span></div><div><strong>{decisions.length}</strong><span>Décisions</span></div></div><h3>Décisions validées</h3>{decisions.length ? decisions.map((d, i) => <p className="modal-decision" key={i}><Check size={15}/>{d}</p>) : <p className="muted">Aucune décision validée. Utilise « Ajouter » dans le panneau latéral.</p>}<button className="primary-button" onClick={() => setShowDecision(false)}>Fermer</button></div></div>}
      <footer className="global-footer"><span>VOXME <b>·</b> Preview technique</span><span>ChatGPT te répond. VOXME te challenge.</span></footer>
    </div>
  );
}
