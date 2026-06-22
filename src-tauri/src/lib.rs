mod build;
pub mod codegen;
mod commands;
mod device;
pub mod identity;
pub mod model;
pub mod pins;
mod server;

use std::net::SocketAddr;
use std::path::PathBuf;

use tokio::sync::broadcast;

use crate::build::runner::ServerEvent;
use crate::server::{build_router, AppState};

const DEFAULT_PORT: u16 = 8787;

/// Start the local server: serve the built frontend (if present), expose the
/// `/api` routes + build-event WebSocket, and open the app in the default browser.
pub async fn run() -> anyhow::Result<()> {
    env_logger::init();

    let (tx, _rx) = broadcast::channel::<ServerEvent>(1024);
    let state = AppState { tx };

    let dist_dir = resolve_dist_dir();
    if let Some(ref dir) = dist_dir {
        log::info!("Serving frontend from {}", dir.display());
    } else {
        log::warn!("No frontend build found; serving API only (use the Vite dev server)");
    }

    let router = build_router(state, dist_dir.clone());

    // Bind the preferred port, falling back to an ephemeral port if it's taken.
    let port: u16 = std::env::var("SIMPANMAN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?,
    };
    let addr: SocketAddr = listener.local_addr()?;
    let url = format!("http://127.0.0.1:{}", addr.port());
    log::info!("Sim Panel Manager running at {url}");

    // Only auto-open a browser tab when we're actually serving the UI.
    if dist_dir.is_some() {
        if let Err(e) = webbrowser::open(&url) {
            log::warn!("Could not open browser automatically: {e}. Open {url} manually.");
        }
    } else {
        println!("API server ready at {url}");
    }

    axum::serve(listener, router).await?;
    Ok(())
}

/// Locate the built `dist/` directory: an explicit override, then next to the
/// executable (production layout), then the repo root (running via `cargo run`).
fn resolve_dist_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("SIMPANMAN_DIST") {
        let p = PathBuf::from(dir);
        return p.is_dir().then_some(p);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let p = exe_dir.join("dist");
            if p.is_dir() {
                return Some(p);
            }
        }
    }

    // Dev fallback: <crate>/../dist relative to this source file's manifest.
    let repo_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("dist"));
    repo_dist.filter(|p| p.is_dir())
}
