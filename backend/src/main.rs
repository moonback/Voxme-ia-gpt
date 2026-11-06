use axum::{extract::State, http::Method, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState { http: reqwest::Client, gemini_key: Option<String>, gemini_model: String }

#[derive(Serialize)]
struct Health { status: &'static str, service: &'static str, ai_configured: bool }

#[derive(Deserialize)]
struct DebateRequest { message: String, agent: String, context: Option<String> }

#[derive(Serialize)]
struct DebateResponse { agent: String, text: String, model: String }

#[derive(Serialize)]
struct ErrorResponse { error: String }

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    Json(Health { status: "ok", service: "voxme-api", ai_configured: state.gemini_key.is_some() })
}

async fn debate(State(state): State<Arc<AppState>>, Json(payload): Json<DebateRequest>) -> Result<Json<DebateResponse>, (axum::http::StatusCode, Json<ErrorResponse>)> {
    let message = payload.message.trim();
    if message.is_empty() || message.len() > 12_000 {
        return Err((axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "Le message doit contenir entre 1 et 12000 caractères.".into() })));
    }
    let key = state.gemini_key.as_ref().ok_or_else(|| (axum::http::StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error: "GEMINI_API_KEY n'est pas configurée côté serveur.".into() })))?;
    let (role, instruction) = match payload.agent.to_lowercase().as_str() {
        "thomas" => ("Thomas", "Tu es Thomas, contradicteur constructif. Identifie les hypothèses fragiles, risques et objections utiles. Ne contredis jamais sans argument."),
        "ines" => ("Inès", "Tu es Inès, analyste de synthèse. Relie les arguments, distingue faits et hypothèses, puis formule les questions ouvertes et options."),
        _ => ("Chloé", "Tu es Chloé, animatrice et vision principale. Comprends l'intention, développe une analyse structurée et fais progresser le débat."),
    };
    let context = payload.context.unwrap_or_default();
    let prompt = format!("Tu participes à une table ronde VOXME. Réponds en français, naturellement et de façon concise à l'oral.\nRÔLE : {role}. {instruction}\nCONTEXTE : {context}\nMESSAGE UTILISATEUR : {message}");
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", state.gemini_model, key);
    let body = serde_json::json!({ "contents": [{ "parts": [{ "text": prompt }] }], "generationConfig": { "temperature": 0.7, "maxOutputTokens": 700 } });
    let response = state.http.post(url).json(&body).send().await
        .map_err(|_| (axum::http::StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Impossible de joindre le fournisseur IA.".into() })))?;
    let status = response.status();
    let data: serde_json::Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        let detail = data.pointer("/error/message").and_then(|v| v.as_str()).unwrap_or("Erreur du fournisseur IA");
        return Err((axum::http::StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: detail.to_string() })));
    }
    let text = data.pointer("/candidates/0/content/parts/0/text").and_then(|v| v.as_str()).unwrap_or("Je n'ai pas pu produire de réponse.").to_string();
    Ok(Json(DebateResponse { agent: role.into(), text, model: state.gemini_model.clone() }))
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt().with_env_filter("info").init();
    let port = env::var("API_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8080);
    let origin = env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
    let state = Arc::new(AppState {
        http: reqwest::Client::new(),
        gemini_key: env::var("GEMINI_API_KEY").ok().filter(|v| !v.is_empty()),
        gemini_model: env::var("GEMINI_TEXT_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".into()),
    });
    let cors = CorsLayer::new().allow_origin(origin.parse::<axum::http::HeaderValue>().unwrap()).allow_methods([Method::GET, Method::POST]).allow_headers(tower_http::cors::Any);
    let app = Router::new().route("/health", get(health)).route("/api/debate/respond", post(debate)).layer(cors).layer(TraceLayer::new_for_http()).with_state(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("VOXME API listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind API");
    axum::serve(listener, app).await.expect("serve API");
}
