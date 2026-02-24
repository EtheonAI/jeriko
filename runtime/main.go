package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// ========== Types ==========

type Task struct {
	TaskID string `json:"task_id"`
	Prompt string `json:"prompt"`
}

type Config struct {
	APIURL     string            `json:"api_url"`
	APIFormat  string            `json:"api_format"` // "anthropic" | "openai"
	APIKey     string            `json:"api_key"`
	Model      string            `json:"model"`
	MaxWorkers int               `json:"max_workers"`
	MaxTokens  int               `json:"max_tokens"`
	Headers    map[string]string `json:"headers"`
}

type Input struct {
	Tasks  []Task `json:"tasks"`
	Config Config `json:"config"`
}

type Result struct {
	TaskID  string `json:"task_id"`
	Output  string `json:"output"`
	Error   string `json:"error,omitempty"`
	Tokens  int    `json:"tokens,omitempty"`
	Latency int64  `json:"latency_ms"`
}

type Output struct {
	OK      bool     `json:"ok"`
	Results []Result `json:"results,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// ========== Anthropic API ==========

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ========== OpenAI API ==========

type openaiRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []openaiMessage `json:"messages"`
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ========== API Callers ==========

var httpClient = &http.Client{
	Timeout: 120 * time.Second,
}

func callAnthropic(config Config, prompt string) (string, int, error) {
	body := anthropicRequest{
		Model:     config.Model,
		MaxTokens: config.MaxTokens,
		Messages: []anthropicMessage{
			{Role: "user", Content: prompt},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", 0, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest("POST", config.APIURL, bytes.NewReader(jsonBody))
	if err != nil {
		return "", 0, fmt.Errorf("request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", config.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	for k, v := range config.Headers {
		req.Header.Set(k, v)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, fmt.Errorf("read: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", 0, fmt.Errorf("api %d: %s", resp.StatusCode, string(respBody))
	}

	var result anthropicResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", 0, fmt.Errorf("decode: %w", err)
	}

	if result.Error != nil {
		return "", 0, fmt.Errorf("api: %s", result.Error.Message)
	}

	if len(result.Content) == 0 {
		return "", 0, fmt.Errorf("empty response")
	}

	return result.Content[0].Text, result.Usage.OutputTokens, nil
}

func callOpenAI(config Config, prompt string) (string, int, error) {
	body := openaiRequest{
		Model:     config.Model,
		MaxTokens: config.MaxTokens,
		Messages: []openaiMessage{
			{Role: "user", Content: prompt},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", 0, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest("POST", config.APIURL, bytes.NewReader(jsonBody))
	if err != nil {
		return "", 0, fmt.Errorf("request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+config.APIKey)
	}

	for k, v := range config.Headers {
		req.Header.Set(k, v)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, fmt.Errorf("read: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", 0, fmt.Errorf("api %d: %s", resp.StatusCode, string(respBody))
	}

	var result openaiResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", 0, fmt.Errorf("decode: %w", err)
	}

	if result.Error != nil {
		return "", 0, fmt.Errorf("api: %s", result.Error.Message)
	}

	if len(result.Choices) == 0 {
		return "", 0, fmt.Errorf("empty response")
	}

	return result.Choices[0].Message.Content, result.Usage.CompletionTokens, nil
}

func callAPI(config Config, prompt string) (string, int, error) {
	switch config.APIFormat {
	case "anthropic":
		return callAnthropic(config, prompt)
	case "openai":
		return callOpenAI(config, prompt)
	default:
		return "", 0, fmt.Errorf("unknown api_format: %s (use \"anthropic\" or \"openai\")", config.APIFormat)
	}
}

// ========== Worker Pool ==========

func executeTask(task Task, config Config) Result {
	start := time.Now()

	output, tokens, err := callAPI(config, task.Prompt)

	latency := time.Since(start).Milliseconds()

	if err != nil {
		return Result{
			TaskID:  task.TaskID,
			Error:   err.Error(),
			Latency: latency,
		}
	}

	return Result{
		TaskID:  task.TaskID,
		Output:  output,
		Tokens:  tokens,
		Latency: latency,
	}
}

func runTasks(input Input) Output {
	workers := input.Config.MaxWorkers
	if workers <= 0 {
		workers = 4
	}
	if workers > len(input.Tasks) {
		workers = len(input.Tasks)
	}

	taskChan := make(chan Task, len(input.Tasks))
	resultChan := make(chan Result, len(input.Tasks))

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range taskChan {
				resultChan <- executeTask(task, input.Config)
			}
		}()
	}

	for _, t := range input.Tasks {
		taskChan <- t
	}
	close(taskChan)

	go func() {
		wg.Wait()
		close(resultChan)
	}()

	var results []Result
	for r := range resultChan {
		results = append(results, r)
	}

	return Output{
		OK:      true,
		Results: results,
	}
}

// ========== Main ==========

func main() {
	stdinBytes, err := io.ReadAll(os.Stdin)
	if err != nil {
		outputError("failed to read stdin: " + err.Error())
		os.Exit(1)
	}

	if len(stdinBytes) == 0 {
		outputError("no input provided on stdin")
		os.Exit(1)
	}

	var input Input
	if err := json.Unmarshal(stdinBytes, &input); err != nil {
		outputError("invalid JSON: " + err.Error())
		os.Exit(1)
	}

	if len(input.Tasks) == 0 {
		outputError("no tasks provided")
		os.Exit(1)
	}

	if input.Config.APIURL == "" {
		outputError("config.api_url is required")
		os.Exit(1)
	}

	if input.Config.APIFormat == "" {
		outputError("config.api_format is required (\"anthropic\" or \"openai\")")
		os.Exit(1)
	}

	if input.Config.Model == "" {
		outputError("config.model is required")
		os.Exit(1)
	}

	if input.Config.MaxTokens <= 0 {
		input.Config.MaxTokens = 4096
	}

	output := runTasks(input)

	jsonOut, _ := json.Marshal(output)
	fmt.Println(string(jsonOut))
}

func outputError(msg string) {
	out := Output{OK: false, Error: msg}
	jsonOut, _ := json.Marshal(out)
	fmt.Println(string(jsonOut))
}
