pub mod button_index;
pub mod emitter;
pub mod render;

#[cfg(test)]
mod tests {
    use crate::model::project::load_project;
    use std::path::Path;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("examples")
            .join(name)
    }

    #[test]
    fn render_f5e_armament_board() {
        let project = load_project(&fixture("f5e-armament.spm")).unwrap();
        let generated = super::render::render_board(&project, "board-arm").unwrap();

        assert!(generated.main_cpp.contains("Joystick_"), "should declare Joystick_");
        assert!(generated.main_cpp.contains("INPUT_PULLUP"), "should set INPUT_PULLUP");
        assert!(generated.main_cpp.contains("setButton"), "should call setButton");
        assert!(generated.platformio_ini.contains("board_arm"), "env should reference board id");
        assert!(generated.platformio_ini.contains("mheironimus/Joystick"), "should include Joystick lib");
    }

    #[test]
    fn render_multi_board_b_has_encoder_and_analog() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let generated = super::render::render_board(&project, "board-b").unwrap();

        assert!(generated.main_cpp.contains("setThrottle") || generated.main_cpp.contains("setSlider"),
            "encoder axis or analog axis setter should appear");
        assert!(generated.main_cpp.contains("analogRead"), "analog controls should use analogRead");
    }

    #[test]
    fn button_indices_stable_across_rerenders() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let map1 = super::button_index::assign_button_indices(&project, "board-b");
        let map2 = super::button_index::assign_button_indices(&project, "board-b");
        assert_eq!(map1, map2);
    }

    #[test]
    fn render_all_boards_no_panic() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        for board in &project.boards {
            super::render::render_board(&project, &board.id)
                .unwrap_or_else(|e| panic!("render failed for {}: {}", board.id, e));
        }
    }
}
