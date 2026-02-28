use serde::{Deserialize, Serialize};

// ── Task Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Text,
    ImageGeneration,
    GeminiImage,
    ImageAnalysis,
    Code,
    Quick,
    Research,
}

impl Default for TaskType {
    fn default() -> Self {
        TaskType::Text
    }
}

// ── Input Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelTask {
    pub task_id: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_type: Option<TaskType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_base: Option<String>,
    pub model: String,
    #[serde(default)]
    pub max_concurrent: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_secs: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub google_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputSchemaField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license_key: Option<String>,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tasks: Option<Vec<ParallelTask>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Vec<OutputSchemaField>>,
    pub config: ApiConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_template: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inputs: Option<Vec<String>>,
}

// ── Output Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelTaskResult {
    pub task_id: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteOutput {
    pub title: String,
    pub results: Vec<ParallelTaskResult>,
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
}

// ── License Types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub sub: String,
    pub plan: String,
    #[serde(default)]
    pub max_subtasks: usize,
    #[serde(default)]
    pub max_concurrent: usize,
    pub exp: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub machine_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanLimits {
    pub plan: String,
    pub max_subtasks: usize,
    pub max_concurrent: usize,
}

impl PlanLimits {
    pub fn free() -> Self {
        PlanLimits {
            plan: "free".to_string(),
            max_subtasks: 5,
            max_concurrent: 2,
        }
    }

    pub fn from_plan(plan: &str) -> Self {
        match plan {
            "pro" => PlanLimits {
                plan: "pro".to_string(),
                max_subtasks: 10,
                max_concurrent: 4,
            },
            "max" => PlanLimits {
                plan: "max".to_string(),
                max_subtasks: 20,
                max_concurrent: 8,
            },
            "enterprise" => PlanLimits {
                plan: "enterprise".to_string(),
                max_subtasks: 50,
                max_concurrent: 8,
            },
            _ => Self::free(),
        }
    }
}

// ── Task Type Detection ─────────────────────────────────────────────────────

impl TaskType {
    /// Detect task type from prompt content via keyword matching.
    pub fn detect(prompt: &str) -> TaskType {
        let lower = prompt.to_lowercase();

        // Gemini image generation — must check BEFORE generic image generation
        if (lower.contains("gemini") || lower.contains("google"))
            && (lower.contains("generate") || lower.contains("create"))
            && lower.contains("image")
        {
            return TaskType::GeminiImage;
        }

        // Image generation (DALL-E keywords)
        if lower.contains("generate an image")
            || lower.contains("generate image")
            || lower.contains("create an image")
            || lower.contains("create image")
            || lower.contains("dall-e")
            || lower.contains("dalle")
        {
            return TaskType::ImageGeneration;
        }

        // Image analysis
        if lower.contains("analyze") && lower.contains("image")
            || lower.contains("describe") && lower.contains("image")
            || lower.contains("what") && lower.contains("image")
        {
            return TaskType::ImageAnalysis;
        }

        // Code tasks
        if lower.contains("write code")
            || lower.contains("write a function")
            || lower.contains("implement")
            || lower.contains("refactor")
            || lower.contains("debug")
        {
            return TaskType::Code;
        }

        // Research tasks
        if lower.contains("research")
            || lower.contains("analyze")
            || lower.contains("compare")
            || lower.contains("summarize")
        {
            return TaskType::Research;
        }

        // Quick tasks
        if lower.contains("translate")
            || lower.contains("convert")
            || lower.contains("format")
            || lower.len() < 50
        {
            return TaskType::Quick;
        }

        TaskType::Text
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_limits_free() {
        let limits = PlanLimits::free();
        assert_eq!(limits.plan, "free");
        assert_eq!(limits.max_subtasks, 5);
        assert_eq!(limits.max_concurrent, 2);
    }

    #[test]
    fn test_plan_limits_pro() {
        let limits = PlanLimits::from_plan("pro");
        assert_eq!(limits.plan, "pro");
        assert_eq!(limits.max_subtasks, 10);
        assert_eq!(limits.max_concurrent, 4);
    }

    #[test]
    fn test_plan_limits_max() {
        let limits = PlanLimits::from_plan("max");
        assert_eq!(limits.max_subtasks, 20);
        assert_eq!(limits.max_concurrent, 8);
    }

    #[test]
    fn test_plan_limits_enterprise() {
        let limits = PlanLimits::from_plan("enterprise");
        assert_eq!(limits.max_subtasks, 50);
        assert_eq!(limits.max_concurrent, 8);
    }

    #[test]
    fn test_plan_limits_unknown_defaults_to_free() {
        let limits = PlanLimits::from_plan("bogus");
        assert_eq!(limits.plan, "free");
        assert_eq!(limits.max_subtasks, 5);
    }

    #[test]
    fn test_detect_image_generation() {
        assert_eq!(TaskType::detect("Generate an image of a cat"), TaskType::ImageGeneration);
        assert_eq!(TaskType::detect("Use DALL-E to make art"), TaskType::ImageGeneration);
        assert_eq!(TaskType::detect("create image of sunset"), TaskType::ImageGeneration);
    }

    #[test]
    fn test_detect_gemini_image() {
        assert_eq!(
            TaskType::detect("Use Gemini to generate an image of mountains"),
            TaskType::GeminiImage
        );
        assert_eq!(
            TaskType::detect("Google create image of a logo"),
            TaskType::GeminiImage
        );
    }

    #[test]
    fn test_detect_image_analysis() {
        assert_eq!(
            TaskType::detect("Analyze the image and describe what you see"),
            TaskType::ImageAnalysis
        );
    }

    #[test]
    fn test_detect_code() {
        assert_eq!(TaskType::detect("Write a function to sort an array"), TaskType::Code);
        assert_eq!(TaskType::detect("Implement a binary search tree"), TaskType::Code);
        assert_eq!(TaskType::detect("Refactor the authentication module"), TaskType::Code);
    }

    #[test]
    fn test_detect_research() {
        assert_eq!(TaskType::detect("Research the best practices for Rust error handling"), TaskType::Research);
        assert_eq!(TaskType::detect("Compare React vs Vue for our use case"), TaskType::Research);
    }

    #[test]
    fn test_detect_quick() {
        assert_eq!(TaskType::detect("Translate hello to Spanish"), TaskType::Quick);
        assert_eq!(TaskType::detect("Hi"), TaskType::Quick); // short prompt
    }

    #[test]
    fn test_detect_text_default() {
        assert_eq!(
            TaskType::detect("Tell me a long detailed story about the history of computing and how it evolved over the decades"),
            TaskType::Text
        );
    }
}
