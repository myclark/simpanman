//! simpanman-helper — native sidecar CLI for the Sim Panel Manager Electron app.
//!
//! Subcommands (invoked one-shot by the Electron main process):
//!   list-ports                                   → JSON array of serial ports
//!   build --project-dir <dir> --env <env> [--port <p>]
//!                                                → 1200-baud touch + `pio` build/
//!                                                  upload, streaming NDJSON events
//!
//! All pure project logic (model, validation, codegen, pins, identity) lives in
//! the TypeScript engine; this binary only does hardware / external-process work.

mod build;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("list-ports") => cmd_list_ports(),
        Some("build") => cmd_build(&args[2..]),
        _ => {
            eprintln!("simpanman-helper: native sidecar for Sim Panel Manager");
            eprintln!("usage:");
            eprintln!("  simpanman-helper list-ports");
            eprintln!(
                "  simpanman-helper build --project-dir <dir> --env <env> [--port <port>]"
            );
            ExitCode::from(2)
        }
    }
}

fn cmd_list_ports() -> ExitCode {
    let ports = build::ports::list_serial_ports();
    match serde_json::to_string(&ports) {
        Ok(s) => {
            println!("{s}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("serializing ports: {e}");
            ExitCode::FAILURE
        }
    }
}

fn cmd_build(args: &[String]) -> ExitCode {
    let mut project_dir: Option<String> = None;
    let mut env_name: Option<String> = None;
    let mut port: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project-dir" => {
                project_dir = args.get(i + 1).cloned();
                i += 2;
            }
            "--env" => {
                env_name = args.get(i + 1).cloned();
                i += 2;
            }
            "--port" => {
                port = args.get(i + 1).cloned();
                i += 2;
            }
            other => {
                eprintln!("unknown argument: {other}");
                return ExitCode::from(2);
            }
        }
    }

    let (Some(dir), Some(env)) = (project_dir, env_name) else {
        eprintln!("build requires --project-dir and --env");
        return ExitCode::from(2);
    };

    match build::runner::build_board(&dir, &env, port.as_deref()) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("{e:#}");
            ExitCode::FAILURE
        }
    }
}
