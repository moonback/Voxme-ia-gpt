import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUp, BookOpen, Brain, Check, ChevronDown, CircleHelp, Command, FileText, Headphones, LayoutDashboard, Library, Menu, Mic, Plus, Settings, Shield, Sparkles, Square, Users, WandSparkles, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { GeminiLiveAudio } from "./lib/geminiLive";
import StudioPage from "./components/StudioPage";
import ProgramsPage from "./components/ProgramsPage";
import MemoryPage from "./components/MemoryPage";
import NotebookPage from "./components/NotebookPage";
import CommunityPage from "./components/CommunityPage";

type Agent = "Chloé" | "Thomas" | "Inès";
type Message = { id: number | string; agent: Agent | "Vous"; text: string; time: string };

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

function WorkspaceApp() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [draft, setDraft] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Nouvelle réflexion");
  const [activeNav, setActiveNav] = useState("Conversation");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Mode vocal prêt");
  const liveClient = useRef<GeminiLiveAudio | null>(null);
  const [thinking, setThinking] = useState(false);
  const [apiError, setApiError] = useState("");
  const [showDecision, setShowDecision] = useState(false);
  const [decisions, setDecisions] = useState<string[]>([]);
  const status = useMemo(() => "Supabase connecté", []);

  useEffect(() => {
    let alive = true;
    async function restoreLatestSession() {
      if (!supabase) { setLoadingSession(false); return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoadingSession(false); return; }
      const { data: sessions } = await supabase.from("sessions").select("id,title").eq("user_id", auth.user.id).order("updated_at", { ascending: false }).limit(1);
      const latest = sessions?.[0];
      if (!alive || !latest) { setLoadingSession(false); return; }
      setSessionId(latest.id); setSessionTitle(latest.title);
      const { data: rows } = await supabase.from("messages").select("id,speaker,content,created_at").eq("session_id", latest.id).order("created_at", { ascending: true }).limit(150);
      if (alive && rows) setMessages(rows.map((row) => ({ id: row.id, agent: row.speaker === "user" ? "Vous" : row.speaker === "chloe" ? "Chloé" : row.speaker === "thomas" ? "Thomas" : "Inès", text: row.content, time: new Date(row.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) })));
      const { data: savedDecisions } = await supabase.from("artifacts").select("content").eq("session_id", latest.id).eq("kind", "decision").eq("status", "accepted");
      if (alive && savedDecisions) setDecisions(savedDecisions.map((item) => typeof item.content?.text === "string" ? item.content.text : "").filter(Boolean));
      if (alive) setLoadingSession(false);
    }
    void restoreLatestSession();
    return () => { alive = false; };
  }, []);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || thinking || !supabase) return;
    const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const history = messages.map((m) => `${m.agent}: ${m.text}`).join("\n").slice(-7000);
    setDraft(""); setApiError(""); setThinking(true);
    setSessionTitle(text.length > 42 ? text.slice(0, 42) + "…" : text);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Ta session a expiré. Reconnecte-toi.");
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const { data: created, error } = await supabase.from("sessions").insert({ user_id: auth.user.id, title: text.slice(0, 120) }).select("id").single();
        if (error || !created) throw new Error(error?.message || "Impossible de créer la session.");
        activeSessionId = created.id; setSessionId(activeSessionId);
      } else {
        const { error } = await supabase.from("sessions").update({ title: text.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", activeSessionId);
        if (error) throw new Error(error.message);
      }
      const { error: saveUserError } = await supabase.from("messages").insert({ session_id: activeSessionId, speaker: "user", content: text });
      if (saveUserError) throw new Error(saveUserError.message);
      setMessages((items) => [...items, { id: Date.now(), agent: "Vous", text, time: now() }]);
      let context = history + "\nVous: " + text;
      for (const [agent, speaker] of [["Chloé", "chloe"], ["Thomas", "thomas"], ["Inès", "ines"]] as const) {
        const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
        if (!accessToken) throw new Error("Session expirée. Reconnecte-toi.");\n        const response = await fetch("/api/debate/respond", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` }, body: JSON.stringify({ message: text, agent, context }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Erreur API (${response.status})`);
        const answer = String(payload.text || "").trim();
        const { error } = await supabase.from("messages").insert({ session_id: activeSessionId, speaker, content: answer });
        if (error) throw new Error(`Réponse générée mais non enregistrée : ${error.message}`);
        setMessages((items) => [...items, { id: Date.now() + Math.random(), agent, text: answer, time: now() }]);
        context += `\n${agent}: ${answer}`;
      }
    } catch (error) { setApiError(error instanceof Error ? error.message : "Impossible de contacter VOXME."); }
    finally { setThinking(false); }
  }

  async function toggleLive() {
    if (liveClient.current) {
      await liveClient.current.stop();
      liveClient.current = null;
      setListening(false);
      return;
    }
    if (!supabase) return;
    const client = new GeminiLiveAudio({
      onStatus: setLiveStatus,
      onError: (message) => setApiError(message),
      onTranscript: async (speaker, text) => {
        const clean = text.trim();
        if (!clean) return;
        const agent = speaker === "user" ? "Vous" : "Chloé";
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        setMessages((items) => [...items, { id: Date.now() + Math.random(), agent, text: clean, time }]);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        let activeId = sessionId;
        if (!activeId) {
          const { data, error } = await supabase.from("sessions").insert({ user_id: auth.user.id, title: "Conversation vocale" }).select("id").single();
          if (error || !data) { setApiError(error?.message || "Impossible de créer la session vocale."); return; }
          activeId = data.id; setSessionId(activeId); setSessionTitle("Conversation vocale");
        }
        const { error } = await supabase.from("messages").insert({ session_id: activeId, speaker, content: clean, transcript: clean });
        if (error) setApiError("Transcription non enregistrée : " + error.message);
      },
    });
    liveClient.current = client;
    try {
      setApiError("");
      await client.start();
      setListening(true);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de démarrer le mode vocal.");
      await client.stop();
      liveClient.current = null;
      setListening(false);
    }
  }

  useEffect(() => () => { void liveClient.current?.stop(); }, []);

  function addDecision() {
    const decision = window.prompt("Quelle décision souhaites-tu enregistrer ?");
    if (decision?.trim()) { setDecisions((items) => [...items, decision.trim()]); void (async () => { if (!supabase || !sessionId) return; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; const { error } = await supabase.from("artifacts").insert({ session_id: sessionId, user_id: auth.user.id, kind: "decision", title: decision.trim(), content: { text: decision.trim() }, status: "accepted", validated_by: auth.user.id, validated_at: new Date().toISOString() }); if (error) setApiError("Décision non enregistrée : " + error.message); })(); }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><WandSparkles size={19} /></div><span>VOXME</span><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fermer"><X size={18}/></button></div>
        <button className="new-session" onClick={() => { setMessages(initialMessages); setSessionId(null); setApiError(""); setSessionTitle("Nouvelle réflexion"); setDecisions([]); }}><Plus size={17}/> Nouvelle session <span>⌘ K</span></button>
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
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Ouvrir le menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><span className="connection"><i/> {status}</span><button className="icon-button" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => void supabase?.auth.signOut()}><X size={18}/></button></div></header>
        {activeNav === "Conversation" ? (
          <div className="workspace">
            <section className="conversation-column">
              <div className="session-heading"><div><div className="eyebrow"><span className="live-pill"><i/> SESSION</span><span>•</span><span>Privée</span></div><h1>{sessionTitle}</h1><p>Une table ronde pour penser mieux, ensemble.</p></div><button className="outline-button" onClick={() => setShowDecision(true)}><LayoutDashboard size={16}/> Tableau de session</button></div>
              {loadingSession && <div className="session-loading">Chargement de ta dernière session…</div>}\n              <div className="agent-row">{agents.map((agent) => <div className="agent-card" key={agent.name}><div className={`agent-avatar ${agent.color}`}>{agent.initials}<span/></div><div><strong>{agent.name}</strong><small>{agent.role}</small></div><span className="agent-status">Prête</span></div>)}</div>
              <div className="conversation-feed">\n                {apiError && <div className="api-error" role="alert">{apiError} — vérifie que le backend Rust est lancé et que GEMINI_API_KEY est configurée.</div>}
                <div className="feed-date">AUJOURD'HUI · DÉBUT DE SESSION</div>
                {messages.map((message) => <article className={`message ${message.agent === "Vous" ? "user-message" : ""}`} key={message.id}><div className={`message-avatar ${message.agent === "Vous" ? "you" : agents.find(a => a.name === message.agent)?.color}`}>{message.agent === "Vous" ? "M" : message.agent[0]}</div><div className="message-body"><div className="message-meta"><strong>{message.agent}</strong><time>{message.time}</time></div><p>{message.text}</p></div></article>)}
                {messages.length === initialMessages.length && <div className="starter-prompts"><button onClick={() => setDraft("Aide-moi à évaluer cette idée : ")}>Évaluer une idée <ArrowUp size={13}/></button><button onClick={() => setDraft("Challenge mon plan et trouve ses angles morts : ")}>Challenger un plan <ArrowUp size={13}/></button><button onClick={() => setDraft("Aide-moi à prendre une décision entre : ")}>Prendre une décision <ArrowUp size={13}/></button></div>}
              </div>
              <div className="composer-wrap"><div className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Présente ton idée, pose une question ou expose un dilemme…" rows={2}/><div className="composer-actions"><div><button className={`icon-button mic-button ${listening ? "recording" : ""}`} onClick={() => void toggleLive()} title={listening ? "Arrêter le mode vocal" : "Démarrer Gemini Live"}><Mic size={17}/></button><span className="composer-hint">{listening ? liveStatus : "Entrée pour envoyer · Maj + Entrée pour une ligne"}</span></div><button className="send-button" onClick={sendMessage} disabled={!draft.trim() || thinking || loadingSession}><ArrowUp size={17}/></button></div></div><div className="composer-foot"><span><Shield size={12}/> Tes échanges restent privés</span><span>Les décisions restent sous ton contrôle</span></div></div>
            </section>
            <aside className="insight-panel"><div className="panel-title"><div><span className="eyebrow">ESPACE DE RÉFLEXION</span><h2>En un coup d'œil</h2></div><button className="icon-button"><FileText size={17}/></button></div><div className="insight-card focus-card"><span className="card-kicker"><Sparkles size={13}/> FIL CONDUCTEUR</span><h3>Fais émerger la bonne question.</h3><p>Expose ton sujet pour que les trois regards puissent commencer à le confronter.</p></div><div className="panel-section"><div className="section-heading"><strong>Décisions</strong><button onClick={addDecision}><Plus size={15}/> Ajouter</button></div>{decisions.length === 0 ? <div className="empty-state"><Check size={16}/><span>Aucune décision validée pour le moment.</span></div> : decisions.map((d, i) => <div className="decision-item" key={i}><Check size={15}/><span>{d}</span></div>)}</div><div className="panel-section"><div className="section-heading"><strong>À explorer</strong><span className="muted-count">3 pistes</span></div><div className="explore-item"><span className="explore-dot violet-dot"/><span>Hypothèses à vérifier</span></div><div className="explore-item"><span className="explore-dot blue-dot"/><span>Risques et objections</span></div><div className="explore-item"><span className="explore-dot amber-dot"/><span>Prochaines actions</span></div></div><div className="panel-footer"><Library size={15}/><span>Les notes détaillées seront accessibles dans le Notebook.</span></div></aside>
          </div>
        ) : activeNav === "Studio" ? <StudioPage/> : activeNav === "Accompagnements" ? <ProgramsPage/> : activeNav === "Mémoire" ? <MemoryPage/> : activeNav === "Notebook" ? <NotebookPage/> : activeNav === "Communauté" ? <CommunityPage/> : (
          <section className="module-placeholder"><div className="placeholder-icon"><WandSparkles size={26}/></div><span className="eyebrow">VOXME WORKSPACE</span><h1>{activeNav}</h1><p>Ce module est prévu dans l'architecture VOXME. Son implémentation fonctionnelle sera ajoutée dans les prochaines phases.</p><button className="outline-button" onClick={() => setActiveNav("Conversation")}>Retourner à la conversation</button></section>
        )}
      </main>
      {showDecision && <div className="modal-backdrop" onClick={() => setShowDecision(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SESSION</span><h2>Tableau de session</h2></div><button className="icon-button" onClick={() => setShowDecision(false)}><X size={18}/></button></div><div className="metric-grid"><div><strong>{messages.length}</strong><span>Messages</span></div><div><strong>3</strong><span>Agents</span></div><div><strong>{decisions.length}</strong><span>Décisions</span></div></div><h3>Décisions validées</h3>{decisions.length ? decisions.map((d, i) => <p className="modal-decision" key={i}><Check size={15}/>{d}</p>) : <p className="muted">Aucune décision validée. Utilise « Ajouter » dans le panneau latéral.</p>}<button className="primary-button" onClick={() => setShowDecision(false)}>Fermer</button></div></div>}
      <footer className="global-footer"><span>VOXME <b>·</b> Preview technique</span><span>ChatGPT te répond. VOXME te challenge.</span></footer>
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase) return; setBusy(true); setError(""); setNotice("");
    try {
      const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) setNotice("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.");
    } catch (e) { setError(e instanceof Error ? e.message : "Authentification impossible."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark"><WandSparkles size={19}/></div><span>VOXME</span></div><span className="eyebrow">TON ESPACE DE RÉFLEXION</span><h1>{mode === "signin" ? "Content de te revoir." : "Crée ton espace."}</h1><p>Connecte-toi pour retrouver tes sessions et tes décisions.</p><label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.fr"/></label><label>Mot de passe<input type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum"/></label>{error && <div className="api-error">{error}</div>}{notice && <div className="auth-notice">{notice}</div>}<button className="primary-button" disabled={busy}>{busy ? "Patiente…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}</button><button type="button" className="auth-switch" onClick={() => {setMode(mode === "signin" ? "signup" : "signin");setError("");setNotice("");}}>{mode === "signin" ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}</button></form></main>;
}

export default function App() {
  const [ready, setReady] = useState(false); const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (!isSupabaseConfigured) return <main className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><WandSparkles size={19}/></div><span>VOXME</span></div><h1>Configure Supabase</h1><p>Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans frontend/.env. N'ajoute jamais de clé service_role dans le frontend.</p></div></main>;
  if (!ready) return <main className="auth-page"><div className="auth-card">Chargement de ton espace…</div></main>;
  return authenticated ? <WorkspaceApp/> : <AuthScreen/>;
}
