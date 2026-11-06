use axum::{extract::State, http::{HeaderMap, Method, StatusCode}, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    http: reqwest::Client,
    gemini_key: Option<String>,
    gemini_model: String,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    live_model: String,
}
#[derive(Serialize)]
struct Health { status: &'static str, service: &'static str, ai_configured: bool, auth_configured: bool }
#[derive(Deserialize)]
struct DebateRequest { message: String, agent: String, context: Option<String> }
#[derive(Serialize)]
struct DebateResponse { agent: String, text: String, model: String }
#[derive(Serialize)]
struct ErrorResponse { error: String }
#[derive(Serialize)]
struct LiveTokenResponse { token: String, model: String }

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    Json(Health {
        status: "ok", service: "voxme-api",
        ai_configured: state.gemini_key.is_some(),
        auth_configured: state.supabase_url.is_some() && state.supabase_anon_key.is_some(),
    })
}

async fn debate(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<DebateRequest>,
) -> Result<Json<DebateResponse>, (StatusCode, Json<ErrorResponse>)> {
    let token = headers.get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| !v.is_empty())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse { error: "Authentification requise.".into() })))?;

    let supabase_url = state.supabase_url.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "SUPABASE_URL non configurée côté serveur.".into() })))?;
    let anon_key = state.supabase_anon_key.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "SUPABASE_ANON_KEY non configurée côté serveur.".into() })))?;
    let auth_response = state.http.get(format!("{}/auth/v1/user", supabase_url.trim_end_matches('/')))
        .header("apikey", anon_key)
        .bearer_auth(token)
        .send().await
        .map_err(|_| (StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Vérification de session Supabase impossible.".into() })))?;
    if !auth_response.status().is_success() {
        return Err((StatusCode::UNAUTHORIZED, Json(ErrorResponse { error: "Session Supabase invalide ou expirée.".into() })));
    }

    let message = payload.message.trim();
    if message.is_empty() || message.len() > 12_000 {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "Le message doit contenir entre 1 et 12000 caractères.".into() })));
    }
    let key = state.gemini_key.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "GEMINI_API_KEY n'est pas configurée côté serveur.".into() })))?;
    let (role, instruction) = match payload.agent.to_lowercase().as_str() {
        "thomas" => ("Thomas", "Tu es Thomas, contradicteur constructif. Identifie les hypothèses fragiles, risques et objections utiles. Ne contredis jamais sans argument."),
        "ines" => ("Inès", "Tu es Inès, analyste de synthèse. Relie les arguments, distingue faits et hypothèses, puis formule les questions ouvertes et options."),
        "chloé" => ("Chloé", "Tu es Chloé, animatrice et vision principale. Comprends l'intention, développe une analyse structurée et fais progresser le débat."),
        _ => return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "Agent inconnu. Valeurs acceptées : chloe, thomas, ines.".into() }))),
    };
    let context = payload.context.unwrap_or_default();
    let prompt = format!("Tu participes à une table ronde VOXME. Réponds en français, naturellement et de façon concise à l'oral.\nRÔLE : {role}. {instruction}\nCONTEXTE : {context}\nMESSAGE UTILISATEUR : {message}");
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", state.gemini_model);
    let body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": { "temperature": 0.7, "maxOutputTokens": 700 }
    });
    let response = state.http.post(url).header("x-goog-api-key", key).json(&body).send().await
        .map_err(|_| (StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Impossible de joindre le fournisseur IA.".into() })))?;
    let status = response.status();
    let data: serde_json::Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        let detail = data.pointer("/error/message").and_then(|v| v.as_str()).unwrap_or("Erreur du fournisseur IA");
        return Err((StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: detail.to_string() })));
    }
    let text = data.pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str()).unwrap_or("Je n'ai pas pu produire de réponse.").to_string();
    Ok(Json(DebateResponse { agent: role.into(), text, model: state.gemini_model.clone() }))
}


async fn live_token(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<LiveTokenResponse>, (StatusCode, Json<ErrorResponse>)> {
    let token = headers.get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| !v.is_empty())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(ErrorResponse { error: "Authentification requise.".into() })))?;
    let supabase_url = state.supabase_url.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "SUPABASE_URL non configurée.".into() })))?;
    let anon_key = state.supabase_anon_key.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "SUPABASE_ANON_KEY non configurée.".into() })))?;
    let auth = state.http.get(format!("{}/auth/v1/user", supabase_url.trim_end_matches('/')))
        .header("apikey", anon_key).bearer_auth(token).send().await
        .map_err(|_| (StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Vérification Supabase impossible.".into() })))?;
    if !auth.status().is_success() {
        return Err((StatusCode::UNAUTHORIZED, Json(ErrorResponse { error: "Session invalide ou expirée.".into() })));
    }
    let api_key = state.gemini_key.as_ref()
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "GEMINI_API_KEY non configurée.".into() })))?;
    let body = serde_json::json!({
        "authToken": {
            "uses": 1,
            "bidiGenerateContentSetup": {
                "model": format!("models/{}", state.live_model),
                "generationConfig": { "responseModalities": ["AUDIO"] },
                "systemInstruction": {
                    "parts": [{ "text": "Tu es Chloé, la voix principale de VOXME. Tu animes une table ronde en français. Sois naturelle, concise, chaleureuse et précise. Tu écoutes l'utilisateur, clarifies son intention et fais progresser sa réflexion. Tu ne prétends jamais être Thomas ou Inès. Les autres agents interviendront séparément." }]
                },
                "sessionResumption": {},
                "contextWindowCompression": { "slidingWindow": {} },
                "inputAudioTranscription": {},
                "outputAudioTranscription": {}
            }
        }
    });
    let response = state.http.post("https://generativelanguage.googleapis.com/v1alpha/auth_tokens")
        .header("x-goog-api-key", api_key).json(&body).send().await
        .map_err(|_| (StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Impossible de créer le jeton Live Gemini.".into() })))?;
    let status = response.status();
    let data: serde_json::Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        let detail = data.pointer("/error/message").and_then(|v| v.as_str()).unwrap_or("Erreur de création du jeton Live");
        return Err((StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: detail.to_string() })));
    }
    let ephemeral = data.get("name").and_then(|v| v.as_str())
        .or_else(|| data.pointer("/authToken/name").and_then(|v| v.as_str()))
        .ok_or_else(|| (StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Gemini n'a pas retourné de jeton éphémère.".into() })))?;
    Ok(Json(LiveTokenResponse { token: ephemeral.to_string(), model: state.live_model.clone() }))
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::from_path("../.env");
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt().with_env_filter("info").init();
    let port = env::var("API_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8080);
    let origin = env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
    let state = Arc::new(AppState {
        http: reqwest::Client::builder().timeout(std::time::Duration::from_secs(45)).build().expect("HTTP client"),
        gemini_key: env::var("GEMINI_API_KEY").ok().filter(|v| !v.is_empty()),
        gemini_model: env::var("GEMINI_TEXT_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".into()),
        supabase_url: env::var("SUPABASE_URL").ok().filter(|v| !v.is_empty()),
        supabase_anon_key: env::var("SUPABASE_ANON_KEY").ok().filter(|v| !v.is_empty()),
        live_model: env::var("GEMINI_LIVE_MODEL").unwrap_or_else(|_| "gemini-3.8-live".into()),
    });
    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<axum::http::HeaderValue>().expect("valid FRONTEND_ORIGIN"))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(tower_http::cors::Any);
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/debate/respond", post(debate))
        .route("/api/live/token", post(live_token))
        .layer(cors).layer(TraceLayer::new_for_http()).with_state(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("VOXME API listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind API");
    axum::serve(listener, app).await.expect("serve API");
}
