use crate::config::config_value;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const DEFAULT_REPO_URL: &str = "https://github.com/liempo/bitch.git";
const SOURCE_DIR_ENV: &str = "BITCH_SRC_DIR";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceUpdateStep {
    pub label: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceUpdatePlan {
    pub source_dir: PathBuf,
    pub install_path: PathBuf,
    pub steps: Vec<SourceUpdateStep>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceUpdateStatus {
    pub current_branch: Option<String>,
    pub dirty: bool,
    pub head_commit: Option<String>,
    pub install_path: String,
    pub main_commit: Option<String>,
    pub source_dir: String,
    pub source_exists: bool,
    pub update_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceUpdateStepResult {
    pub label: String,
    pub ok: bool,
    pub output: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceUpdateResult {
    pub install_path: String,
    pub source_dir: String,
    pub steps: Vec<SourceUpdateStepResult>,
    pub updated: bool,
}

struct CommandOutput {
    output: String,
}

pub fn resolve_source_dir(configured: Option<PathBuf>, default: PathBuf) -> PathBuf {
    configured
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(default)
}

pub fn source_update_plan(
    source_exists: bool,
    dirty: bool,
    source_dir: PathBuf,
    install_path: PathBuf,
) -> SourceUpdatePlan {
    let mut steps = Vec::new();

    if !source_exists {
        steps.push(SourceUpdateStep {
            label: "Clone main".to_string(),
            command: "git".to_string(),
            args: vec!["clone", "--branch", "main", DEFAULT_REPO_URL]
                .into_iter()
                .map(String::from)
                .collect(),
        });
    }

    steps.push(SourceUpdateStep {
        label: "Record current branch".to_string(),
        command: "git".to_string(),
        args: vec!["rev-parse", "--abbrev-ref", "HEAD"]
            .into_iter()
            .map(String::from)
            .collect(),
    });

    if dirty {
        steps.push(SourceUpdateStep {
            label: "Stash local changes".to_string(),
            command: "git".to_string(),
            args: vec!["stash", "push", "--include-untracked"]
                .into_iter()
                .map(String::from)
                .collect(),
        });
    }

    steps.extend([
        SourceUpdateStep {
            label: "Checkout main".to_string(),
            command: "git".to_string(),
            args: vec!["checkout", "main"]
                .into_iter()
                .map(String::from)
                .collect(),
        },
        SourceUpdateStep {
            label: "Pull latest main".to_string(),
            command: "git".to_string(),
            args: vec!["pull", "--ff-only", "origin", "main"]
                .into_iter()
                .map(String::from)
                .collect(),
        },
        SourceUpdateStep {
            label: "Build application".to_string(),
            command: "npm".to_string(),
            args: vec!["run", "build"].into_iter().map(String::from).collect(),
        },
        SourceUpdateStep {
            label: "Install application bundle".to_string(),
            command: "copy".to_string(),
            args: vec![install_path.display().to_string()],
        },
        SourceUpdateStep {
            label: "Restore previous branch".to_string(),
            command: "git".to_string(),
            args: vec!["checkout", "<previous>"]
                .into_iter()
                .map(String::from)
                .collect(),
        },
    ]);

    if dirty {
        steps.push(SourceUpdateStep {
            label: "Restore local changes".to_string(),
            command: "git".to_string(),
            args: vec!["stash", "pop"].into_iter().map(String::from).collect(),
        });
    }

    SourceUpdatePlan {
        source_dir,
        install_path,
        steps,
    }
}

pub fn check_source_update() -> Result<SourceUpdateStatus, String> {
    let source_dir = configured_source_dir()?;
    let install_path = default_install_path()?;
    let source_exists = source_dir.join(".git").exists();

    if !source_exists {
        return Ok(SourceUpdateStatus {
            current_branch: None,
            dirty: false,
            head_commit: None,
            install_path: display_path(&install_path),
            main_commit: None,
            source_dir: display_path(&source_dir),
            source_exists: false,
            update_available: true,
        });
    }

    let dirty = is_dirty(&source_dir)?;
    let current_branch = git_optional(&source_dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let head_commit = git_optional(&source_dir, &["rev-parse", "HEAD"])?;
    let _ = run_git(&source_dir, &["fetch", "origin", "main"])?;
    let main_commit = git_optional(&source_dir, &["rev-parse", "origin/main"])?;
    let update_available = head_commit.as_deref() != main_commit.as_deref();

    Ok(SourceUpdateStatus {
        current_branch,
        dirty,
        head_commit,
        install_path: display_path(&install_path),
        main_commit,
        source_dir: display_path(&source_dir),
        source_exists: true,
        update_available,
    })
}

pub fn run_source_update() -> Result<SourceUpdateResult, String> {
    let source_dir = configured_source_dir()?;
    let install_path = default_install_path()?;
    let source_exists = source_dir.join(".git").exists();
    let mut steps = Vec::new();

    if !source_exists {
        clone_repo(&source_dir, &mut steps)?;
    }

    let dirty = is_dirty(&source_dir)?;
    let previous_ref = current_ref(&source_dir)?;
    let mut stashed = false;

    if dirty {
        run_step(
            &source_dir,
            "Stash local changes",
            "git",
            &[
                "stash",
                "push",
                "--include-untracked",
                "-m",
                "bitch-source-updater",
            ],
            &mut steps,
        )?;
        stashed = true;
    }

    let update_result = run_update_on_main(&source_dir, &install_path, &mut steps);
    let restore_result = restore_workspace(&source_dir, &previous_ref, stashed, &mut steps);

    if let Err(error) = restore_result {
        return Err(format!(
            "{} Workspace restore also failed: {error}",
            update_result
                .err()
                .unwrap_or_else(|| "Update failed.".to_string())
        ));
    }

    update_result?;

    Ok(SourceUpdateResult {
        install_path: display_path(&install_path),
        source_dir: display_path(&source_dir),
        steps,
        updated: true,
    })
}

fn run_update_on_main(
    source_dir: &Path,
    install_path: &Path,
    steps: &mut Vec<SourceUpdateStepResult>,
) -> Result<(), String> {
    run_step(
        source_dir,
        "Checkout main",
        "git",
        &["checkout", "main"],
        steps,
    )?;
    run_step(
        source_dir,
        "Pull latest main",
        "git",
        &["pull", "--ff-only", "origin", "main"],
        steps,
    )?;
    run_step(
        source_dir,
        "Build application",
        "npm",
        &["run", "build"],
        steps,
    )?;
    install_bundle(source_dir, install_path, steps)?;
    Ok(())
}

fn restore_workspace(
    source_dir: &Path,
    previous_ref: &str,
    stashed: bool,
    steps: &mut Vec<SourceUpdateStepResult>,
) -> Result<(), String> {
    run_step(
        source_dir,
        "Restore previous branch",
        "git",
        &["checkout", previous_ref],
        steps,
    )?;
    if stashed {
        run_step(
            source_dir,
            "Restore local changes",
            "git",
            &["stash", "pop"],
            steps,
        )?;
    }
    Ok(())
}

fn clone_repo(source_dir: &Path, steps: &mut Vec<SourceUpdateStepResult>) -> Result<(), String> {
    let parent = source_dir.parent().ok_or_else(|| {
        format!(
            "Could not resolve parent directory for {}",
            source_dir.display()
        )
    })?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    let output = run_command_in(
        parent,
        "git",
        &[
            "clone",
            "--branch",
            "main",
            DEFAULT_REPO_URL,
            source_dir
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| format!("Invalid source directory {}", source_dir.display()))?,
        ],
    )?;
    steps.push(SourceUpdateStepResult {
        label: "Clone main".to_string(),
        ok: true,
        output: output.output,
    });
    Ok(())
}

fn install_bundle(
    source_dir: &Path,
    install_path: &Path,
    steps: &mut Vec<SourceUpdateStepResult>,
) -> Result<(), String> {
    let bundle_path = source_dir.join("src-tauri/target/release/bundle/macos/BITCH.app");
    if !bundle_path.exists() {
        return Err(format!(
            "Built app bundle not found at {}",
            bundle_path.display()
        ));
    }

    let parent = install_path.parent().ok_or_else(|| {
        format!(
            "Could not resolve parent directory for {}",
            install_path.display()
        )
    })?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;

    let staged = install_path.with_extension("app.updater-new");
    let backup = install_path.with_extension("app.previous");
    remove_path(&staged)?;
    copy_dir_all(&bundle_path, &staged)?;
    remove_path(&backup)?;
    if install_path.exists() {
        fs::rename(install_path, &backup).map_err(|e| {
            format!(
                "Failed to move existing app from {} to {}: {e}",
                install_path.display(),
                backup.display()
            )
        })?;
    }
    fs::rename(&staged, install_path).map_err(|e| {
        let _ = fs::rename(&backup, install_path);
        format!("Failed to install {}: {e}", install_path.display())
    })?;
    remove_path(&backup)?;

    steps.push(SourceUpdateStepResult {
        label: "Install application bundle".to_string(),
        ok: true,
        output: format!("Installed {}", install_path.display()),
    });
    Ok(())
}

fn copy_dir_all(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| format!("Failed to create {}: {e}", to.display()))?;
    for entry in
        fs::read_dir(from).map_err(|e| format!("Failed to read {}: {e}", from.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = to.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)
                .map_err(|e| format!("Failed to copy {}: {e}", target.display()))?;
        }
    }
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove {}: {e}", path.display()))
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to remove {}: {e}", path.display()))
    }
}

fn current_ref(source_dir: &Path) -> Result<String, String> {
    let branch = run_git(source_dir, &["rev-parse", "--abbrev-ref", "HEAD"])?.output;
    let branch = branch.trim();
    if branch != "HEAD" && !branch.is_empty() {
        return Ok(branch.to_string());
    }
    Ok(run_git(source_dir, &["rev-parse", "HEAD"])?
        .output
        .trim()
        .to_string())
}

fn is_dirty(source_dir: &Path) -> Result<bool, String> {
    Ok(!run_git(source_dir, &["status", "--porcelain"])?
        .output
        .trim()
        .is_empty())
}

fn git_optional(source_dir: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let value = run_git(source_dir, args)?.output.trim().to_string();
    Ok((!value.is_empty()).then_some(value))
}

fn run_git(source_dir: &Path, args: &[&str]) -> Result<CommandOutput, String> {
    run_command_in(source_dir, "git", args)
}

fn run_step(
    source_dir: &Path,
    label: &str,
    command: &str,
    args: &[&str],
    steps: &mut Vec<SourceUpdateStepResult>,
) -> Result<(), String> {
    let output = run_command_in(source_dir, command, args);
    match output {
        Ok(output) => {
            steps.push(SourceUpdateStepResult {
                label: label.to_string(),
                ok: true,
                output: output.output,
            });
            Ok(())
        }
        Err(error) => {
            steps.push(SourceUpdateStepResult {
                label: label.to_string(),
                ok: false,
                output: error.clone(),
            });
            Err(error)
        }
    }
}

fn run_command_in(cwd: &Path, command: &str, args: &[&str]) -> Result<CommandOutput, String> {
    let output = Command::new(command)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run {command}: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if !output.status.success() {
        return Err(format!("{command} {} failed: {combined}", args.join(" ")));
    }

    Ok(CommandOutput { output: combined })
}

fn configured_source_dir() -> Result<PathBuf, String> {
    let configured = config_value(SOURCE_DIR_ENV).map(PathBuf::from);
    Ok(resolve_source_dir(configured, default_source_dir()?))
}

fn default_source_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".config/bitch/source/bitch"))
}

fn default_install_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join("Applications/BITCH.app"))
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME for BITCH source updater".to_string())
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn resolves_source_dir_from_env_before_default_clone_dir() {
        let configured = PathBuf::from("/Users/test/dev/bitch");
        let default = PathBuf::from("/Users/test/.config/bitch/source/bitch");

        let resolved = resolve_source_dir(Some(configured.clone()), default);

        assert_eq!(resolved, configured);
    }

    #[test]
    fn plans_clone_when_source_directory_is_missing() {
        let dir = PathBuf::from("/Users/test/.config/bitch/source/bitch");
        let plan = source_update_plan(
            false,
            false,
            dir.clone(),
            "/Users/test/Applications/BITCH.app".into(),
        );

        assert_eq!(plan.source_dir, dir);
        assert!(plan.steps.iter().any(|step| step.command == "git"
            && step.args
                == [
                    "clone",
                    "--branch",
                    "main",
                    "https://github.com/liempo/bitch.git"
                ]));
        assert!(plan
            .steps
            .iter()
            .any(|step| step.label == "Build application"
                && step.command == "npm"
                && step.args == ["run", "build"]));
    }

    #[test]
    fn plans_stash_checkout_pull_build_install_and_restore_for_existing_dirty_repo() {
        let plan = source_update_plan(
            true,
            true,
            "/Users/test/dev/bitch".into(),
            "/Users/test/Applications/BITCH.app".into(),
        );
        let labels: Vec<&str> = plan.steps.iter().map(|step| step.label.as_str()).collect();

        assert_eq!(
            labels,
            vec![
                "Record current branch",
                "Stash local changes",
                "Checkout main",
                "Pull latest main",
                "Build application",
                "Install application bundle",
                "Restore previous branch",
                "Restore local changes",
            ]
        );
        assert!(plan
            .steps
            .iter()
            .any(|step| step.command == "git"
                && step.args == ["stash", "push", "--include-untracked"]));
        assert!(plan
            .steps
            .iter()
            .any(|step| step.command == "git"
                && step.args == ["pull", "--ff-only", "origin", "main"]));
    }
}
