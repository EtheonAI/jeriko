export const integrationIcons = [
  "stripe",
  "telegram",
  "github",
  "vercel",
  "gdrive",
  "onedrive",
  "twitter",
  "twilio",
  "apple",
  "spotify",
  "gmail",
  "whatsapp",
] as const;

export type IntegrationIcon = (typeof integrationIcons)[number];

export interface FeatureHint {
  icon: "monitor" | "sparkles" | "puzzle" | "zap";
  label: string;
}

export const featureHints: FeatureHint[] = [
  { icon: "monitor", label: "OS Control" },
  { icon: "sparkles", label: "AI Fabric" },
  { icon: "puzzle", label: "Integrations" },
  { icon: "zap", label: "Automation" },
];
