mod license;
mod orchestrator;
mod types;

use napi_derive::napi;

use types::{ExecuteInput, ExecuteOutput, ParallelTask, ParallelTaskResult, TaskType};

// ── NAPI Entry Points ───────────────────────────────────────────────────────

/// Validate license and execute parallel LLM tasks in waves.
///
/// Accepts a JSON string (`ExecuteInput`), returns a JSON string (`ExecuteOutput`).
/// All errors are caught and returned as results — this function never throws.
#[napi]
pub async fn validate_and_execute(input: String) -> napi::Result<String> {
    let parsed: ExecuteInput = serde_json::from_str(&input)
        .map_err(|e| napi::Error::from_reason(format!("Invalid input JSON: {}", e)))?;

    // Resolve tasks: explicit array OR prompt_template + inputs expansion
    let tasks = resolve_tasks(&parsed)?;

    // Compute machine ID and validate license
    let machine_id = license::compute_machine_id();
    let limits = license::validate_license(&parsed.license_key, &machine_id);

    // Execute waves
    let results =
        orchestrator::execute_waves(tasks, &limits, &parsed.config, &parsed.output_schema).await;

    // Tally results
    let completed = results.iter().filter(|r| r.status == "completed").count();
    let failed = results.iter().filter(|r| r.status == "error" && !is_skipped(r)).count();
    let skipped = results.iter().filter(|r| is_skipped(r)).count();

    let output = ExecuteOutput {
        title: parsed.title,
        results,
        total: completed + failed + skipped,
        completed,
        failed,
        skipped,
    };

    serde_json::to_string(&output)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {}", e)))
}

/// Get the machine ID (SHA-256 of hostname + username + platform).
#[napi]
pub fn get_machine_id() -> String {
    license::compute_machine_id()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn resolve_tasks(input: &ExecuteInput) -> napi::Result<Vec<ParallelTask>> {
    // Option 1: explicit tasks array
    if let Some(ref tasks) = input.tasks {
        return Ok(tasks.clone());
    }

    // Option 2: prompt_template + inputs
    if let Some(ref template) = input.prompt_template {
        let inputs = input.inputs.as_deref().unwrap_or(&[]);
        let tasks: Vec<ParallelTask> = inputs
            .iter()
            .enumerate()
            .map(|(i, val)| {
                let prompt = template
                    .replace("{{input}}", val)
                    .replace("{input}", val);
                let task_type = Some(TaskType::detect(&prompt));
                ParallelTask {
                    task_id: format!("task-{}", i),
                    prompt,
                    task_type,
                }
            })
            .collect();
        return Ok(tasks);
    }

    Err(napi::Error::from_reason(
        "Either 'tasks' or 'prompt_template' + 'inputs' must be provided".to_string(),
    ))
}

fn is_skipped(r: &ParallelTaskResult) -> bool {
    r.status == "error"
        && r.error
            .as_ref()
            .map(|e| e.starts_with("Skipped:"))
            .unwrap_or(false)
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ApiConfig;

    #[test]
    fn test_resolve_tasks_explicit() {
        let input = ExecuteInput {
            license_key: None,
            title: "test".to_string(),
            tasks: Some(vec![
                ParallelTask {
                    task_id: "1".to_string(),
                    prompt: "hello".to_string(),
                    task_type: None,
                },
                ParallelTask {
                    task_id: "2".to_string(),
                    prompt: "world".to_string(),
                    task_type: None,
                },
            ]),
            output_schema: None,
            config: ApiConfig {
                api_key: "k".to_string(),
                api_base: None,
                model: "m".to_string(),
                max_concurrent: 2,
                timeout_secs: None,
                google_api_key: None,
            },
            prompt_template: None,
            inputs: None,
        };

        let tasks = resolve_tasks(&input).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].task_id, "1");
        assert_eq!(tasks[1].prompt, "world");
    }

    #[test]
    fn test_resolve_tasks_template() {
        let input = ExecuteInput {
            license_key: None,
            title: "test".to_string(),
            tasks: None,
            output_schema: None,
            config: ApiConfig {
                api_key: "k".to_string(),
                api_base: None,
                model: "m".to_string(),
                max_concurrent: 2,
                timeout_secs: None,
                google_api_key: None,
            },
            prompt_template: Some("Translate '{{input}}' to Spanish".to_string()),
            inputs: Some(vec!["hello".to_string(), "goodbye".to_string()]),
        };

        let tasks = resolve_tasks(&input).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].task_id, "task-0");
        assert_eq!(tasks[0].prompt, "Translate 'hello' to Spanish");
        assert_eq!(tasks[1].prompt, "Translate 'goodbye' to Spanish");
    }

    #[test]
    fn test_resolve_tasks_template_single_brace() {
        let input = ExecuteInput {
            license_key: None,
            title: "test".to_string(),
            tasks: None,
            output_schema: None,
            config: ApiConfig {
                api_key: "k".to_string(),
                api_base: None,
                model: "m".to_string(),
                max_concurrent: 2,
                timeout_secs: None,
                google_api_key: None,
            },
            prompt_template: Some("Summarize: {input}".to_string()),
            inputs: Some(vec!["article1".to_string()]),
        };

        let tasks = resolve_tasks(&input).unwrap();
        assert_eq!(tasks[0].prompt, "Summarize: article1");
    }

    #[test]
    fn test_resolve_tasks_neither_errors() {
        let input = ExecuteInput {
            license_key: None,
            title: "test".to_string(),
            tasks: None,
            output_schema: None,
            config: ApiConfig {
                api_key: "k".to_string(),
                api_base: None,
                model: "m".to_string(),
                max_concurrent: 2,
                timeout_secs: None,
                google_api_key: None,
            },
            prompt_template: None,
            inputs: None,
        };

        assert!(resolve_tasks(&input).is_err());
    }

    #[test]
    fn test_is_skipped() {
        let skipped = ParallelTaskResult {
            task_id: "1".to_string(),
            status: "error".to_string(),
            result: None,
            error: Some("Skipped: your free plan allows max 5 parallel subtasks".to_string()),
            model_used: None,
        };
        assert!(is_skipped(&skipped));

        let failed = ParallelTaskResult {
            task_id: "2".to_string(),
            status: "error".to_string(),
            result: None,
            error: Some("Request failed: timeout".to_string()),
            model_used: None,
        };
        assert!(!is_skipped(&failed));

        let completed = ParallelTaskResult {
            task_id: "3".to_string(),
            status: "completed".to_string(),
            result: Some("hi".to_string()),
            error: None,
            model_used: Some("gpt-4o".to_string()),
        };
        assert!(!is_skipped(&completed));
    }
}
