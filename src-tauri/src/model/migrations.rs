use super::types::{Project, CURRENT_SCHEMA_VERSION};

pub fn migrate(project: Project) -> anyhow::Result<Project> {
    while project.schema_version < CURRENT_SCHEMA_VERSION {
        match project.schema_version {
            // Future: add v1 -> v2 migration here when schema changes
            v => {
                return Err(anyhow::anyhow!(
                    "Unknown schema version {}; this app supports up to version {}",
                    v,
                    CURRENT_SCHEMA_VERSION
                ))
            }
        }
    }
    if project.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(anyhow::anyhow!(
            "Project schema version {} is newer than this app supports ({}). Please upgrade Sim Panel Manager.",
            project.schema_version,
            CURRENT_SCHEMA_VERSION
        ));
    }
    Ok(project)
}
