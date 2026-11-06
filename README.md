# VOXME

**ChatGPT te répond. VOXME te challenge.**

VOXME est une plateforme de délibération vocale multi-agents : Chloé construit le raisonnement, Thomas le challenge et Inès relie les arguments pour aider l'utilisateur à décider.

## Stack

- Frontend : React 19, TypeScript, Vite, PWA.
- Backend : Rust, Axum, Tokio.
- Données : Supabase (Auth, PostgreSQL, Storage, Realtime, pgvector).
- IA : Gemini Live pour la voix (intégration temps réel à finaliser), Gemini API côté serveur pour les traitements texte.
- Intégrations : MCP (serveurs personnels, permissions et exécution isolée à implémenter).

## Démarrage

### Prérequis
- Node.js 22+
- Rust stable
- Un projet Supabase
- Une clé Gemini (pour les endpoints IA)

### Configuration
Copier `.env.example` vers `.env`, puis renseigner les variables. Ne jamais exposer les clés Gemini ou les secrets Supabase dans le frontend.

### Installer et lancer
```bash
npm install
npm run install:frontend
npm run dev
```

Le frontend Vite écoute sur http://localhost:5173 et le backend Rust sur http://localhost:8080.

Pour lancer uniquement le backend :
```bash
cd backend
cargo run
```

## Structure

```
frontend/                 React + TypeScript + PWA
backend/                  API Rust/Axum
supabase/migrations/      Schéma SQL, RLS et index
```

## Modules produit

1. Conversation /chat/:id — table ronde Chloé, Thomas, Inès.
2. Studio & Accompagnements — livrables et parcours guidés.
3. Communauté & Social — partage et collaboration.
4. Mémoire sélective — souvenirs contrôlés par l'utilisateur.
5. Tableau de session & Lab — métriques et expérimentation.
6. Notebook documentaire & RAG — ingestion, recherche et citations.
7. Administration /admin — gestion et supervision.
8. Serveurs MCP personnels & outils IA — intégrations gouvernées par permissions.

## État d'avancement

Cette première base initialise le monorepo, l'interface responsive, l'API Rust et le premier schéma Supabase. Elle ne constitue pas encore une version production complète : l'orchestration vocale Gemini Live, les trois agents, le RAG, les workflows MCP, les espaces sociaux et les tests end-to-end doivent être développés et validés dans les phases suivantes.

## Sécurité

- Les clés fournisseurs restent côté serveur.
- Activer et tester les politiques RLS avant d'exposer les données.
- Les actions MCP sensibles doivent exiger une autorisation explicite.
- Ne jamais considérer une proposition d'IA comme une décision utilisateur sans validation.
