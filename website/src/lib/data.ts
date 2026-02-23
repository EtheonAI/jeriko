export const terminalSequences = [
  {
    command: "jeriko sys --info --format text",
    output: "os=macOS_15.3 cpu=Apple_M3_Pro cores=12 mem=18.4/36GB uptime=3d_12h",
  },
  {
    command: 'jeriko browse --screenshot "https://stripe.com" --text',
    output: '{"ok":true,"data":{"title":"Stripe","screenshot":"/tmp/shot_0224.png","text":"..."}}',
  },
  {
    command: "jeriko sys --info | jeriko notify",
    output: '{"ok":true,"data":{"message_id":4821,"chat":"admin"}}',
  },
  {
    command: 'jeriko stripe customers list --limit 2',
    output: '{"ok":true,"data":[{"id":"cus_R3x","name":"Alice"},{"id":"cus_K7m","name":"Bob"}]}',
  },
  {
    command: 'jeriko x post "Shipped v2.0 🚀"',
    output: '{"ok":true,"data":{"id":"1893027461","text":"Shipped v2.0 🚀"}}',
  },
];

export interface Feature {
  icon: string;
  title: string;
  description: string;
  commands: string[];
}

export const features: Feature[] = [
  {
    icon: "monitor",
    title: "Full System Control",
    description: "CPU, memory, battery, processes, window management, app launching — complete machine awareness in one call.",
    commands: ["sys", "proc", "window", "open", "exec"],
  },
  {
    icon: "globe",
    title: "Browser Automation",
    description: "Navigate, screenshot, click, type, scroll, extract text — full Playwright-powered headless browser.",
    commands: ["browse"],
  },
  {
    icon: "folder",
    title: "File System",
    description: "Read, write, find, grep, list — everything your AI needs to work with files on disk.",
    commands: ["fs"],
  },
  {
    icon: "camera",
    title: "Media Capture",
    description: "Desktop screenshots, webcam photos & video, microphone recording, and text-to-speech.",
    commands: ["screenshot", "camera", "audio"],
  },
  {
    icon: "mail",
    title: "Communication",
    description: "Send Telegram messages, iMessages, read emails, search the web — all from the command line.",
    commands: ["notify", "msg", "email", "search"],
  },
  {
    icon: "apple",
    title: "macOS Native",
    description: "Apple Notes, Reminders, Calendar, Contacts, Clipboard, Music — deep native integration via AppleScript.",
    commands: ["notes", "remind", "calendar", "contacts", "clipboard", "music"],
  },
  {
    icon: "terminal",
    title: "Shell Execution",
    description: "Run any command with timeout, cwd, and env stripping. Pipe output between jeriko commands.",
    commands: ["exec"],
  },
  {
    icon: "brain",
    title: "AI Self-Discovery",
    description: "Auto-generates its own system prompt. Any AI model can discover and use every available command.",
    commands: ["discover", "memory"],
  },
];

export interface ModelInfo {
  name: string;
  description: string;
}

export const aiModels: ModelInfo[] = [
  { name: "Claude", description: "Anthropic" },
  { name: "GPT", description: "OpenAI" },
  { name: "Ollama", description: "Local LLMs" },
  { name: "LM Studio", description: "Local GUI" },
  { name: "Gemini", description: "Google" },
  { name: "llama.cpp", description: "C++ Runtime" },
  { name: "vLLM", description: "Production" },
  { name: "Any OpenAI-Compatible", description: "Universal" },
];

export interface AppIntegration {
  name: string;
  category: "business" | "communication" | "productivity" | "media";
}

export const apps: AppIntegration[] = [
  { name: "Stripe", category: "business" },
  { name: "X / Twitter", category: "business" },
  { name: "Twilio", category: "business" },
  { name: "Telegram", category: "communication" },
  { name: "WhatsApp", category: "communication" },
  { name: "iMessage", category: "communication" },
  { name: "Gmail", category: "communication" },
  { name: "Apple Notes", category: "productivity" },
  { name: "Calendar", category: "productivity" },
  { name: "Reminders", category: "productivity" },
  { name: "Contacts", category: "productivity" },
  { name: "Apple Music", category: "media" },
  { name: "Spotify", category: "media" },
  { name: "DuckDuckGo", category: "media" },
  { name: "Playwright", category: "media" },
];
