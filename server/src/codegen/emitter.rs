use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct GeneratedBoard {
    pub platformio_ini: String,
    pub main_cpp: String,
    pub board_json: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFile {
    pub relative_path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProject {
    pub board_id: String,
    pub files: Vec<GeneratedFile>,
}

pub fn to_generated_project(board_id: &str, generated: GeneratedBoard) -> GeneratedProject {
    let mut files = vec![
        GeneratedFile {
            relative_path: "platformio.ini".to_string(),
            content: generated.platformio_ini,
        },
        GeneratedFile {
            relative_path: "src/main.cpp".to_string(),
            content: generated.main_cpp,
        },
    ];

    if let Some(json) = generated.board_json {
        let board_json_path = format!("boards/{}.json", board_id.replace('-', "_"));
        files.push(GeneratedFile {
            relative_path: board_json_path,
            content: json,
        });
    }

    GeneratedProject {
        board_id: board_id.to_string(),
        files,
    }
}

pub fn write_to_temp_dir(generated: &GeneratedProject) -> anyhow::Result<PathBuf> {
    let root = tempfile::TempDir::new()
        .context("creating temp dir for PlatformIO project")?
        .keep();
    write_project_files(&root, generated)?;
    Ok(root)
}

pub fn write_project_files(root: &Path, generated: &GeneratedProject) -> anyhow::Result<()> {
    for file in &generated.files {
        let path = root.join(&file.relative_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating dir {}", parent.display()))?;
        }
        std::fs::write(&path, &file.content)
            .with_context(|| format!("writing {}", path.display()))?;
    }
    Ok(())
}
