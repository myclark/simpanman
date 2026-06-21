use simpanman_lib::codegen::emitter::{to_generated_project, write_to_temp_dir};
use simpanman_lib::codegen::render::render_board;
use simpanman_lib::model::project::load_project;
use std::path::Path;

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("examples")
        .join(name)
}

struct BoardFixture {
    project_file: &'static str,
    board_id: &'static str,
    env_name: &'static str,
}

const BOARDS: &[BoardFixture] = &[
    BoardFixture {
        project_file: "f5e-armament.spm",
        board_id: "board-arm",
        env_name: "board_arm",
    },
    BoardFixture {
        project_file: "multi-board-demo.spm",
        board_id: "board-a",
        env_name: "board_a",
    },
    BoardFixture {
        project_file: "multi-board-demo.spm",
        board_id: "board-b",
        env_name: "board_b",
    },
    BoardFixture {
        project_file: "multi-board-demo.spm",
        board_id: "board-c",
        env_name: "board_c",
    },
];

#[test]
fn firmware_files_are_written() {
    for b in BOARDS {
        let project = load_project(&fixture(b.project_file))
            .unwrap_or_else(|e| panic!("load {}: {e}", b.project_file));

        let generated = render_board(&project, b.board_id)
            .unwrap_or_else(|e| panic!("render {} / {}: {e}", b.project_file, b.board_id));

        let gp = to_generated_project(b.board_id, generated);
        let dir = write_to_temp_dir(&gp)
            .unwrap_or_else(|e| panic!("write_to_temp_dir {} / {}: {e}", b.project_file, b.board_id));

        let ini = dir.join("platformio.ini");
        let cpp = dir.join("src").join("main.cpp");
        let board_json = dir
            .join("boards")
            .join(format!("{}.json", b.board_id.replace('-', "_")));

        assert!(ini.exists(), "{} / {}: platformio.ini missing", b.project_file, b.board_id);
        assert!(cpp.exists(), "{} / {}: src/main.cpp missing", b.project_file, b.board_id);
        assert!(board_json.exists(), "{} / {}: boards/{}.json missing", b.project_file, b.board_id, b.board_id.replace('-', "_"));

        assert!(
            std::fs::metadata(&ini).unwrap().len() > 0,
            "{} / {}: platformio.ini is empty", b.project_file, b.board_id
        );
        assert!(
            std::fs::metadata(&cpp).unwrap().len() > 0,
            "{} / {}: src/main.cpp is empty", b.project_file, b.board_id
        );
    }
}

#[test]
fn pio_compile() {
    let pio = match std::env::var("PIO_BIN") {
        Ok(v) if !v.is_empty() => v,
        _ => {
            eprintln!("PIO_BIN not set — skipping PlatformIO compile test");
            return;
        }
    };

    for b in BOARDS {
        let project = load_project(&fixture(b.project_file))
            .unwrap_or_else(|e| panic!("load {}: {e}", b.project_file));

        let generated = render_board(&project, b.board_id)
            .unwrap_or_else(|e| panic!("render {} / {}: {e}", b.project_file, b.board_id));

        let gp = to_generated_project(b.board_id, generated);
        let dir = write_to_temp_dir(&gp)
            .unwrap_or_else(|e| panic!("write_to_temp_dir {} / {}: {e}", b.project_file, b.board_id));

        let status = std::process::Command::new(&pio)
            .args(["run", "-e", b.env_name])
            .current_dir(&dir)
            .status()
            .unwrap_or_else(|e| panic!("failed to spawn pio for {} / {}: {e}", b.project_file, b.board_id));

        assert!(
            status.success(),
            "pio compile failed for {} / {} (exit: {status})",
            b.project_file, b.board_id
        );
    }
}
