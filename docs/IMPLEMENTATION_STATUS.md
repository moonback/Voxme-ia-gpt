# État d'implémentation VOXME

Dernière mise à jour : 2026-11-06

## Fonctionnel dans la branche feat/voxme-foundation

| Module | État réel |
|---|---|
| Authentification | Inscription et connexion Supabase e-mail/mot de passe |
| Conversation texte | Envoi séquentiel à Chloé, Thomas et Inès via Gemini 3.8 Flash |
| Persistance | Sessions, messages et décisions validées enregistrés dans Supabase |
| Conversation vocale | Chloé via Gemini 3.8 Live, jeton éphémère, WebSocket, micro PCM, lecture PCM, transcriptions |
| Studio | CRUD de projets, notes et statuts |
| Accompagnements | Modèles de parcours, étapes, progression persistée |
| Mémoire | Création, validation et suppression |
| Notebook | Collections, import et stockage privé PDF/DOCX/TXT/Markdown |
| Communauté | Publications publiques, réactions et commentaires |
| Sessions & Lab | Historique, statut, compteurs et transcript |
| Diagnostics conversation | Logs structurés navigateur, orchestration, Gemini Live, audio, erreurs et durées ; timeline filtrable par session |\n| Administration | Console de diagnostic en lecture seule, protégée par le rôle server-managed admin |
| MCP | Registre privé d'endpoints et activation/désactivation de l'entrée (pas d'exécution) |
| PWA | Manifest, icône SVG, service worker et cache shell hors ligne |

## Non implémenté ou incomplet

- Orchestration vocale de Thomas et Inès pendant une session Live ; voix distinctes et gestion complète de la prise de parole.
- Reprise automatique des sessions Live après GoAway et persistance des handles de reprise.
- Extraction du texte des fichiers, chunking, embeddings, indexation pgvector, RAG et citations documentaires.
- Administration complète : gestion des utilisateurs, quotas, modèles, clés, paramètres globaux et audit (seule la console de diagnostic est présente).
- Découverte des outils MCP, authentification des serveurs, exécution isolée, autorisations par outil, confirmations utilisateur et journal d'exécution.
- Groupes communautaires, profils publics, invitations, modération et signalements.
- Expérimentation Lab des prompts, personas, modèles et stratégies de débat.
- Tests unitaires, tests d'intégration navigateur/microphone, tests RLS et validation complète du déploiement.\n- Corrélation des logs backend dans une plateforme centralisée (les événements backend sont actuellement dans stdout/stderr Rust, corrélés via x-request-id).

## Sécurité à conserver

- Les clés Gemini et Supabase service_role restent exclusivement côté serveur.
- Les jetons Live sont éphémères, contraints au modèle gemini-3.8-live et délivrés après vérification de la session Supabase.
- Les politiques RLS sont la frontière d'isolation des données utilisateur ; elles doivent être testées avec plusieurs comptes.
- Un serveur MCP enregistré n'est pas un serveur exécuté : le champ enabled du registre n'autorise pas encore l'invocation d'outils.
- Les décisions affichées comme validées doivent provenir d'une action explicite de l'utilisateur.
