//! Local HTTP + WebSocket server that replaces the former Tauri IPC layer.
//!
//! Every former `#[tauri::command]` is exposed as `POST /api/<name>` (JSON in →
//! JSON out, errors as `400` text), and the build log/status stream is delivered
//! over a single `GET /api/events` WebSocket. The built React frontend is served
//! as static files so the whole app runs in the user's real browser — no embedded
//! webview, so the macOS 26 `WKWebView` crash cannot occur.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Request, State,
    },
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

use crate::build::runner::ServerEvent;
use crate::commands;
use crate::model::types::{Board, Control, Panel, Project};

#[derive(Clone)]
pub struct AppState {
    pub tx: broadcast::Sender<ServerEvent>,
}

/// Build the application router. `dist_dir`, when present, is served as static
/// files (the production frontend); in dev the Vite server proxies `/api` here.
pub fn build_router(state: AppState, dist_dir: Option<PathBuf>) -> Router {
    let api = Router::new()
        .route("/project_new", post(h_project_new))
        .route("/project_open", post(h_project_open))
        .route("/project_serialize", post(h_project_serialize))
        .route("/panel_upsert", post(h_panel_upsert))
        .route("/panel_delete", post(h_panel_delete))
        .route("/board_upsert", post(h_board_upsert))
        .route("/board_delete", post(h_board_delete))
        .route("/control_upsert", post(h_control_upsert))
        .route("/control_delete", post(h_control_delete))
        .route("/validate", post(h_validate))
        .route("/board_pinmap", post(h_board_pinmap))
        .route("/allocate_identity", post(h_allocate_identity))
        .route("/generate_board", post(h_generate_board))
        .route("/list_serial_ports", post(h_list_serial_ports))
        .route("/build_board", post(h_build_board))
        .route("/events", get(h_events))
        .with_state(state);

    let mut router = Router::new().nest("/api", api);

    if let Some(dir) = dist_dir {
        router = router.fallback_service(
            ServeDir::new(dir).append_index_html_on_directories(true),
        );
    }

    // Reject requests whose Host header isn't loopback (DNS-rebinding guard).
    router.layer(middleware::from_fn(guard_local_host))
}

// ── Loopback guard ───────────────────────────────────────────────────────────

async fn guard_local_host(req: Request, next: Next) -> Response {
    if let Some(host) = req.headers().get("host").and_then(|h| h.to_str().ok()) {
        // Strip the optional ":port" then compare against loopback names.
        let hostname = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(host);
        let ok = hostname == "127.0.0.1"
            || hostname == "localhost"
            || hostname == "[::1]"
            || hostname == "::1";
        if !ok {
            return (StatusCode::FORBIDDEN, "non-loopback host rejected").into_response();
        }
    }
    next.run(req).await
}

// ── Result → Response helper ─────────────────────────────────────────────────

fn json_result<T: Serialize>(r: Result<T, String>) -> Response {
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
    }
}

// ── Request payloads (camelCase to match the existing frontend) ───────────────

#[derive(Deserialize)]
struct NameReq {
    name: String,
}
#[derive(Deserialize)]
struct ContentReq {
    content: String,
}
#[derive(Deserialize)]
struct ProjectReq {
    project: Project,
}
#[derive(Deserialize)]
struct PanelReq {
    project: Project,
    panel: Panel,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PanelDeleteReq {
    project: Project,
    panel_id: String,
}
#[derive(Deserialize)]
struct BoardReq {
    project: Project,
    board: Board,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardIdReq {
    project: Project,
    board_id: String,
}
#[derive(Deserialize)]
struct ControlReq {
    project: Project,
    control: Control,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlDeleteReq {
    project: Project,
    control_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildReq {
    project: Project,
    board_id: String,
    port: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn h_project_new(Json(req): Json<NameReq>) -> Response {
    json_result(commands::project_new(req.name))
}
async fn h_project_open(Json(req): Json<ContentReq>) -> Response {
    json_result(commands::project_open(req.content))
}
async fn h_project_serialize(Json(req): Json<ProjectReq>) -> Response {
    json_result(commands::project_serialize(req.project))
}
async fn h_panel_upsert(Json(req): Json<PanelReq>) -> Response {
    json_result(commands::panel_upsert(req.project, req.panel))
}
async fn h_panel_delete(Json(req): Json<PanelDeleteReq>) -> Response {
    json_result(commands::panel_delete(req.project, req.panel_id))
}
async fn h_board_upsert(Json(req): Json<BoardReq>) -> Response {
    json_result(commands::board_upsert(req.project, req.board))
}
async fn h_board_delete(Json(req): Json<BoardIdReq>) -> Response {
    json_result(commands::board_delete(req.project, req.board_id))
}
async fn h_control_upsert(Json(req): Json<ControlReq>) -> Response {
    json_result(commands::control_upsert(req.project, req.control))
}
async fn h_control_delete(Json(req): Json<ControlDeleteReq>) -> Response {
    json_result(commands::control_delete(req.project, req.control_id))
}
async fn h_validate(Json(req): Json<ProjectReq>) -> Response {
    json_result(commands::validate(req.project))
}
async fn h_board_pinmap(Json(req): Json<BoardIdReq>) -> Response {
    json_result(commands::board_pinmap(req.project, req.board_id))
}
async fn h_allocate_identity(Json(req): Json<BoardIdReq>) -> Response {
    json_result(commands::allocate_identity(req.project, req.board_id))
}
async fn h_generate_board(Json(req): Json<BoardIdReq>) -> Response {
    json_result(commands::generate_board(req.project, req.board_id))
}
async fn h_list_serial_ports() -> Response {
    json_result(commands::list_serial_ports())
}
async fn h_build_board(State(st): State<AppState>, Json(req): Json<BuildReq>) -> Response {
    json_result(commands::build_board(st.tx.clone(), req.project, req.board_id, req.port).await)
}

// ── Build event WebSocket ────────────────────────────────────────────────────

async fn h_events(ws: WebSocketUpgrade, State(st): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| events_socket(socket, st.tx.subscribe()))
}

async fn events_socket(mut socket: WebSocket, mut rx: broadcast::Receiver<ServerEvent>) {
    loop {
        match rx.recv().await {
            Ok(event) => {
                let Ok(text) = serde_json::to_string(&event) else {
                    continue;
                };
                if socket.send(Message::Text(text)).await.is_err() {
                    break; // client disconnected
                }
            }
            // Slow client lagged behind; keep going with newer events.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}
