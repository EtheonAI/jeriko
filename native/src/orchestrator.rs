use futures::future::join_all;
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

use crate::types::{
    ApiConfig, OutputSchemaField, ParallelTask, ParallelTaskResult, PlanLimits, TaskType,
};

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_CONCURRENT_WORKERS: usize = 4;
const DEFAULT_TIMEOUT_SECS: u64 = 60;
const IMAGE_TIMEOUT_SECS: u64 = 90;

// ── Wave Execution ──────────────────────────────────────────────────────────

/// Execute tasks in waves, respecting plan limits and concurrency caps.
///
/// 1. Cap total tasks to `limits.max_subtasks`
/// 2. Cap concurrency to `min(limits, config, MAX_CONCURRENT_WORKERS)`
/// 3. Process in waves via `join_all`
/// 4. Skipped tasks get a descriptive error
pub async fn execute_waves(
    tasks: Vec<ParallelTask>,
    limits: &PlanLimits,
    config: &ApiConfig,
    output_schema: &Option<Vec<OutputSchemaField>>,
) -> Vec<ParallelTaskResult> {
    let max_concurrent = effective_concurrency(limits, config);

    // Split into execute vs. skip
    let execute_count = tasks.len().min(limits.max_subtasks);
    let (execute_tasks, skip_tasks) = tasks.split_at(execute_count);

    let timeout = config.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
    let client = Client::builder()
        .timeout(Duration::from_secs(timeout.max(IMAGE_TIMEOUT_SECS)))
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut all_results: Vec<ParallelTaskResult> = Vec::with_capacity(tasks.len());

    // Execute in waves
    for wave in execute_tasks.chunks(max_concurrent) {
        let futures: Vec<_> = wave
            .iter()
            .map(|task| execute_one(&client, task, config, output_schema, timeout))
            .collect();

        let wave_results = join_all(futures).await;
        all_results.extend(wave_results);
    }

    // Append skipped results
    for task in skip_tasks {
        all_results.push(ParallelTaskResult {
            task_id: task.task_id.clone(),
            status: "error".to_string(),
            result: None,
            error: Some(format!(
                "Skipped: your {} plan allows max {} parallel subtasks",
                limits.plan, limits.max_subtasks
            )),
            model_used: None,
        });
    }

    all_results
}

fn effective_concurrency(limits: &PlanLimits, config: &ApiConfig) -> usize {
    let config_max = if config.max_concurrent > 0 {
        config.max_concurrent
    } else {
        MAX_CONCURRENT_WORKERS
    };
    limits
        .max_concurrent
        .min(config_max)
        .min(MAX_CONCURRENT_WORKERS)
        .max(1) // at least 1
}

// ── Single Task Execution ───────────────────────────────────────────────────

async fn execute_one(
    client: &Client,
    task: &ParallelTask,
    config: &ApiConfig,
    output_schema: &Option<Vec<OutputSchemaField>>,
    timeout_secs: u64,
) -> ParallelTaskResult {
    let task_type = task
        .task_type
        .clone()
        .unwrap_or_else(|| TaskType::detect(&task.prompt));

    let result = match task_type {
        TaskType::GeminiImage => execute_gemini_image(client, task, config).await,
        TaskType::ImageGeneration => execute_dalle(client, task, config).await,
        _ => execute_chat(client, task, config, &task_type, output_schema, timeout_secs).await,
    };

    match result {
        Ok((text, model)) => ParallelTaskResult {
            task_id: task.task_id.clone(),
            status: "completed".to_string(),
            result: Some(text),
            error: None,
            model_used: Some(model),
        },
        Err(err) => ParallelTaskResult {
            task_id: task.task_id.clone(),
            status: "error".to_string(),
            result: None,
            error: Some(err),
            model_used: None,
        },
    }
}

// ── Chat Completions (OpenAI-compatible) ────────────────────────────────────

async fn execute_chat(
    client: &Client,
    task: &ParallelTask,
    config: &ApiConfig,
    task_type: &TaskType,
    output_schema: &Option<Vec<OutputSchemaField>>,
    _timeout_secs: u64,
) -> Result<(String, String), String> {
    let model = route_model(&config.model, task_type);
    let api_base = config
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let url = format!("{}/chat/completions", api_base);

    let mut body = json!({
        "model": model,
        "messages": [
            { "role": "user", "content": task.prompt }
        ],
        "temperature": 0.7,
    });

    // Inject JSON schema response format if output_schema is provided
    if let Some(schema_fields) = output_schema {
        if !schema_fields.is_empty() {
            let properties: serde_json::Map<String, serde_json::Value> = schema_fields
                .iter()
                .map(|f| {
                    (
                        f.name.clone(),
                        json!({ "type": map_field_type(&f.field_type) }),
                    )
                })
                .collect();
            let required: Vec<&str> = schema_fields.iter().map(|f| f.name.as_str()).collect();

            body["response_format"] = json!({
                "type": "json_schema",
                "json_schema": {
                    "name": "output",
                    "strict": true,
                    "schema": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                        "additionalProperties": false
                    }
                }
            });
        }
    }

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("API error {}: {}", status, truncate(&resp_text, 200)));
    }

    let resp_json: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("JSON parse error: {}", e))?;

    let content = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok((content, model.to_string()))
}

/// Route model based on task type for OpenAI models.
/// Non-OpenAI models (not starting with "gpt-" or "o1" or "o3") pass through unchanged.
fn route_model<'a>(base_model: &'a str, task_type: &TaskType) -> &'a str {
    let is_openai = base_model.starts_with("gpt-")
        || base_model.starts_with("o1")
        || base_model.starts_with("o3");

    if !is_openai {
        return base_model;
    }

    match task_type {
        TaskType::Code => "gpt-4.1-mini",
        TaskType::Research => "gpt-4.1-mini",
        TaskType::Quick => "gpt-4.1-nano",
        TaskType::ImageAnalysis => "gpt-4o",
        _ => base_model,
    }
}

// ── DALL-E Image Generation ─────────────────────────────────────────────────

async fn execute_dalle(
    client: &Client,
    task: &ParallelTask,
    config: &ApiConfig,
) -> Result<(String, String), String> {
    let api_base = config
        .api_base
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let url = format!("{}/images/generations", api_base);

    let body = json!({
        "model": "dall-e-3",
        "prompt": task.prompt,
        "n": 1,
        "size": "1024x1024",
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DALL-E request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("DALL-E error {}: {}", status, truncate(&resp_text, 200)));
    }

    let resp_json: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("JSON parse error: {}", e))?;

    let image_url = resp_json["data"][0]["url"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if image_url.is_empty() {
        return Err("DALL-E returned no image URL".to_string());
    }

    Ok((image_url, "dall-e-3".to_string()))
}

// ── Gemini Image Generation ─────────────────────────────────────────────────

async fn execute_gemini_image(
    client: &Client,
    task: &ParallelTask,
    config: &ApiConfig,
) -> Result<(String, String), String> {
    let api_key = config
        .google_api_key
        .as_deref()
        .ok_or_else(|| "google_api_key required for Gemini image generation".to_string())?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={}",
        api_key
    );

    let body = json!({
        "contents": [{
            "parts": [{ "text": task.prompt }]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        }
    });

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini error {}: {}", status, truncate(&resp_text, 200)));
    }

    let resp_json: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("JSON parse error: {}", e))?;

    // Extract text or inline image data
    let parts = &resp_json["candidates"][0]["content"]["parts"];
    let mut text_parts: Vec<String> = Vec::new();

    if let Some(arr) = parts.as_array() {
        for part in arr {
            if let Some(text) = part["text"].as_str() {
                text_parts.push(text.to_string());
            }
            if let Some(data) = part["inlineData"]["data"].as_str() {
                let mime = part["inlineData"]["mimeType"]
                    .as_str()
                    .unwrap_or("image/png");
                text_parts.push(format!("data:{};base64,{}", mime, data));
            }
        }
    }

    if text_parts.is_empty() {
        return Err("Gemini returned no content".to_string());
    }

    Ok((text_parts.join("\n"), "gemini-2.0-flash-exp".to_string()))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn map_field_type(t: &str) -> &str {
    match t {
        "number" | "integer" | "int" => "number",
        "boolean" | "bool" => "boolean",
        "array" => "array",
        _ => "string",
    }
}

fn truncate(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        &s[..max_len]
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_effective_concurrency_respects_all_caps() {
        let limits = PlanLimits {
            plan: "pro".to_string(),
            max_subtasks: 10,
            max_concurrent: 4,
        };
        let config = ApiConfig {
            api_key: "k".to_string(),
            api_base: None,
            model: "gpt-4o".to_string(),
            max_concurrent: 3,
            timeout_secs: None,
            google_api_key: None,
        };
        assert_eq!(effective_concurrency(&limits, &config), 3);
    }

    #[test]
    fn test_effective_concurrency_capped_by_max_workers() {
        let limits = PlanLimits {
            plan: "enterprise".to_string(),
            max_subtasks: 50,
            max_concurrent: 8,
        };
        let config = ApiConfig {
            api_key: "k".to_string(),
            api_base: None,
            model: "gpt-4o".to_string(),
            max_concurrent: 10,
            timeout_secs: None,
            google_api_key: None,
        };
        // Capped by MAX_CONCURRENT_WORKERS = 4
        assert_eq!(effective_concurrency(&limits, &config), 4);
    }

    #[test]
    fn test_effective_concurrency_at_least_one() {
        let limits = PlanLimits {
            plan: "free".to_string(),
            max_subtasks: 5,
            max_concurrent: 0,
        };
        let config = ApiConfig {
            api_key: "k".to_string(),
            api_base: None,
            model: "gpt-4o".to_string(),
            max_concurrent: 0,
            timeout_secs: None,
            google_api_key: None,
        };
        assert_eq!(effective_concurrency(&limits, &config), 1);
    }

    #[test]
    fn test_route_model_openai_code() {
        assert_eq!(route_model("gpt-4o", &TaskType::Code), "gpt-4.1-mini");
    }

    #[test]
    fn test_route_model_openai_research() {
        assert_eq!(route_model("gpt-4o", &TaskType::Research), "gpt-4.1-mini");
    }

    #[test]
    fn test_route_model_openai_quick() {
        assert_eq!(route_model("gpt-4o", &TaskType::Quick), "gpt-4.1-nano");
    }

    #[test]
    fn test_route_model_openai_image_analysis() {
        assert_eq!(route_model("gpt-4o-mini", &TaskType::ImageAnalysis), "gpt-4o");
    }

    #[test]
    fn test_route_model_openai_text_passthrough() {
        assert_eq!(route_model("gpt-4o", &TaskType::Text), "gpt-4o");
    }

    #[test]
    fn test_route_model_non_openai_passthrough() {
        assert_eq!(route_model("claude-3-opus", &TaskType::Code), "claude-3-opus");
        assert_eq!(route_model("mistral-large", &TaskType::Research), "mistral-large");
        assert_eq!(route_model("qwen2.5:7b", &TaskType::Quick), "qwen2.5:7b");
    }

    #[test]
    fn test_map_field_type() {
        assert_eq!(map_field_type("number"), "number");
        assert_eq!(map_field_type("integer"), "number");
        assert_eq!(map_field_type("int"), "number");
        assert_eq!(map_field_type("boolean"), "boolean");
        assert_eq!(map_field_type("bool"), "boolean");
        assert_eq!(map_field_type("array"), "array");
        assert_eq!(map_field_type("string"), "string");
        assert_eq!(map_field_type("whatever"), "string");
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello world", 5), "hello");
        assert_eq!(truncate("hi", 10), "hi");
    }

    #[tokio::test]
    async fn test_execute_waves_skips_over_limit() {
        let tasks: Vec<ParallelTask> = (0..8)
            .map(|i| ParallelTask {
                task_id: format!("task-{}", i),
                prompt: "say hi".to_string(),
                task_type: Some(TaskType::Quick),
            })
            .collect();

        let limits = PlanLimits {
            plan: "free".to_string(),
            max_subtasks: 3,
            max_concurrent: 2,
        };
        let config = ApiConfig {
            api_key: "fake-key".to_string(),
            api_base: Some("http://localhost:1/v1".to_string()), // will fail but that's ok
            model: "test".to_string(),
            max_concurrent: 2,
            timeout_secs: Some(1),
            google_api_key: None,
        };

        let results = execute_waves(tasks, &limits, &config, &None).await;

        assert_eq!(results.len(), 8);

        // First 3 attempted (will fail due to fake endpoint, but that's fine)
        for r in &results[..3] {
            assert_ne!(r.status, "skipped");
        }

        // Last 5 should be skipped
        for r in &results[3..] {
            assert_eq!(r.status, "error");
            assert!(r.error.as_ref().unwrap().contains("Skipped"));
            assert!(r.error.as_ref().unwrap().contains("free"));
        }
    }
}
