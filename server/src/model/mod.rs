pub mod migrations;
pub mod project;
pub mod types;
pub mod validation;

#[cfg(test)]
mod tests {
    use super::project::load_project;
    use super::types::{BoardType, Control};
    use super::validation::validate;
    use std::path::Path;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("examples")
            .join(name)
    }

    #[test]
    fn load_f5e_armament() {
        let project = load_project(&fixture("f5e-armament.spm")).unwrap();
        assert_eq!(project.schema_version, 1);
        assert_eq!(project.boards.len(), 1);
        assert_eq!(project.boards[0].board_type, BoardType::Leonardo);
        let report = validate(&project);
        assert!(report.errors.is_empty(), "unexpected errors: {:?}", report.errors);
    }

    #[test]
    fn load_multi_board_demo() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        assert_eq!(project.boards.len(), 3);
        assert_eq!(project.panels.len(), 3);
        assert_eq!(project.controls.len(), 10);

        let encoders: Vec<_> = project
            .controls
            .iter()
            .filter(|c| matches!(c, Control::Encoder(_)))
            .collect();
        assert_eq!(encoders.len(), 2);

        let report = validate(&project);
        assert!(report.errors.is_empty(), "unexpected errors: {:?}", report.errors);
        // Expect encoder-on-non-interrupt-pin warnings for A0/A1 and A2/A3
        assert!(!report.warnings.is_empty(), "expected warnings for non-interrupt encoder pins");
    }

    #[test]
    fn roundtrip_serialization() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let json = serde_json::to_string_pretty(&project).unwrap();
        let reparsed: super::types::Project = serde_json::from_str(&json).unwrap();
        assert_eq!(reparsed.controls.len(), project.controls.len());
        assert_eq!(reparsed.boards.len(), project.boards.len());
    }
}
