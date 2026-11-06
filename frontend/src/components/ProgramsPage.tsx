import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, Circle, Plus, Target } from "lucide-react";
import { supabase } from "../lib/supabase";

type Program = { id: string; title: string; objective: string; status: string };
type Step = { id: string; program_id: string; title: string; instructions: string; position: number; completed_at: string | null };
const templates = [
  { title: "Lancer un projet", objective: "Passer d'une idée à un plan d'action concret.", steps: [["Clarifier l'idée","Décris le problème, les utilisateurs et la valeur apportée."],["Valider le besoin","Identifie les utilisateurs à interroger et les preuves à recueillir."],["Définir une première version","Choisis le périmètre minimum utile et les critères de réussite."],["Construire le plan d'action","Découpe le travail en étapes, responsables et échéances."],["Faire le bilan","Compare les résultats aux objectifs et ajuste la suite."]] },
  { title: "Résoudre un problème", objective: "Comprendre les causes, comparer les options et décider.", steps: [["Formuler le problème","Décris les faits observables et l'impact réel."],["Identifier les causes","Sépare les symptômes des causes racines."],["Explorer les options","Génère plusieurs solutions et leurs compromis."],["Choisir une approche","Définis les critères et justifie le choix."],["Tester et apprendre","Mesure le résultat et décide de la suite."]] },
  { title: "Apprendre une compétence", objective: "Construire un parcours d'apprentissage progressif.", steps: [["Définir le niveau cible","Formule ce que tu veux être capable de réaliser."],["Évaluer le point de départ","Repère les acquis et les lacunes."],["Organiser la pratique","Prévois des exercices courts et réguliers."],["Réaliser un projet pratique","Applique la compétence dans un cas réel."],["Évaluer les progrès","Identifie les acquis et les prochains objectifs."]] },
];

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = programs.find((p) => p.id === selectedId) || null;
  const selectedSteps = steps.filter((step) => step.program_id === selectedId).sort((a,b) => a.position-b.position);
  const done = selectedSteps.filter((step) => step.completed_at).length;

  async function load() {
    if (!supabase) return;
    const [{ data: p, error: pe }, { data: s, error: se }] = await Promise.all([
      supabase.from("guided_programs").select("id,title,objective,status").order("created_at", { ascending: false }),
      supabase.from("program_steps").select("id,program_id,title,instructions,position,completed_at").order("position"),
    ]);
    if (pe || se) setError(pe?.message || se?.message || "Chargement impossible.");
    setPrograms((p || []) as Program[]); setSteps((s || []) as Step[]);
    if (!selectedId && p?.[0]) setSelectedId(p[0].id);
  }
  useEffect(() => { void load(); }, []);

  async function createProgram(template: typeof templates[number]) {
    if (!supabase || busy) return;
    setBusy(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Session expirée."); setBusy(false); return; }
    const { data, error } = await supabase.from("guided_programs").insert({ user_id: auth.user.id, title: template.title, objective: template.objective }).select("id,title,objective,status").single();
    if (error || !data) { setError(error?.message || "Création impossible."); setBusy(false); return; }
    const rows = template.steps.map(([title, instructions], position) => ({ program_id: data.id, user_id: auth.user.id, title, instructions, position }));
    const { data: createdSteps, error: stepError } = await supabase.from("program_steps").insert(rows).select("id,program_id,title,instructions,position,completed_at");
    if (stepError) { setError(stepError.message); await supabase.from("guided_programs").delete().eq("id", data.id); }
    else { setPrograms((items) => [data as Program, ...items]); setSteps((items) => [...items, ...(createdSteps as Step[] || [])]); setSelectedId(data.id); }
    setBusy(false);
  }

  async function toggleStep(step: Step) {
    if (!supabase) return;
    const completed_at = step.completed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("program_steps").update({ completed_at }).eq("id", step.id);
    if (error) setError(error.message);
    else {
      setSteps((items) => items.map((item) => item.id === step.id ? { ...item, completed_at } : item));
      const next = selectedSteps.filter((item) => item.id !== step.id && Boolean(item.completed_at)).length + (completed_at ? 1 : 0);
      if (selected && next === selectedSteps.length) {
        await supabase.from("guided_programs").update({ status: "completed" }).eq("id", selected.id);
        setPrograms((items) => items.map((item) => item.id === selected.id ? { ...item, status: "completed" } : item));
      } else if (selected?.status === "completed") {
        await supabase.from("guided_programs").update({ status: "active" }).eq("id", selected.id);
        setPrograms((items) => items.map((item) => item.id === selected.id ? { ...item, status: "active" } : item));
      }
    }
  }

  return <section className="module-page"><header className="module-header"><div><span className="eyebrow">PARCOURS GUIDÉS</span><h1>Accompagnements</h1><p>Avance avec une méthode claire, des étapes et des résultats visibles.</p></div><span className="module-count">{programs.length} parcours</span></header>
    {error && <div className="api-error">{error}</div>}
    <div className="template-grid">{templates.map((template) => <article className="template-card" key={template.title}><div className="template-icon"><Target size={18}/></div><h3>{template.title}</h3><p>{template.objective}</p><button onClick={() => void createProgram(template)} disabled={busy}><Plus size={14}/> Démarrer ce parcours</button></article>)}</div>
    <div className="program-area"><aside className="program-list"><div className="project-list-title">MES PARCOURS</div>{programs.length === 0 ? <p className="module-muted">Aucun parcours démarré.</p> : programs.map((p) => <button key={p.id} className={`project-list-item ${selectedId === p.id ? "active" : ""}`} onClick={() => setSelectedId(p.id)}><BookOpenCheck size={16}/><span><strong>{p.title}</strong><small>{p.status === "completed" ? "Terminé" : "En cours"}</small></span></button>)}</aside>
      <div className="program-detail">{selected ? <><div className="program-detail-head"><div><span className="eyebrow">TON OBJECTIF</span><h2>{selected.title}</h2><p>{selected.objective}</p></div><strong>{done}/{selectedSteps.length}</strong></div><div className="progress-track"><i style={{ width: `${selectedSteps.length ? done / selectedSteps.length * 100 : 0}%` }}/></div><div className="program-steps">{selectedSteps.map((step, index) => <button className={`program-step ${step.completed_at ? "completed" : ""}`} key={step.id} onClick={() => void toggleStep(step)}><span className="step-number">{step.completed_at ? <CheckCircle2 size={17}/> : <Circle size={17}/>}</span><span><small>ÉTAPE {index + 1}</small><strong>{step.title}</strong><p>{step.instructions}</p></span></button>)}</div></> : <div className="module-empty large"><BookOpenCheck size={28}/><strong>Choisis un parcours</strong><span>Démarre un modèle ci-dessus pour structurer ta progression.</span></div>}</div>
    </div>
  </section>;
}
