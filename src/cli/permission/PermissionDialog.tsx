/**
 * Permission Subsystem — single-request dialog.
 *
 * Renders one pending PermissionRequest using Subsystem 1 primitives
 * (Dialog, Badge, KeyboardHint). Kind-specific preview helpers produce
 * the body content. Every color flows through useTheme() — a theme
 * switch restyles the dialog on the next render.
 *
 * The dialog is a PURE renderer — it does not read from the store or
 * resolve requests. The overlay component owns the queue dispatch; this
 * one just draws one request well.
 */

import React from "react";
import { Box, Text } from "ink";
import { Dialog } from "../ui/chrome/Dialog.js";
import { Badge } from "../ui/chrome/Badge.js";
import { Column } from "../ui/layout/Column.js";
import { Divider } from "../ui/layout/Divider.js";
import { useTheme } from "../hooks/useTheme.js";
import type { Intent } from "../ui/types.js";
import type { KeyHint } from "../ui/types.js";
import type {
  PermissionKind,
  PermissionRequest,
  RiskLevel,
} from "./types.js";

// ---------------------------------------------------------------------------
// Risk → Intent / Badge text
// ---------------------------------------------------------------------------

/**
 * Risk drives both the dialog's border intent and the badge color.
 * Centralising the mapping keeps red/amber/green usage consistent across
 * every consumer of the risk field.
 */
function intentForRisk(risk: RiskLevel): Intent {
  switch (risk) {
    case "critical": return "error";
    case "high":     return "error";
    case "medium":   return "warning";
    case "low":      return "info";
  }
}

function labelForRisk(risk: RiskLevel): string {
  return risk.toUpperCase();
}

// ---------------------------------------------------------------------------
// Kind → title prefix
// ---------------------------------------------------------------------------

function titleForKind(kind: PermissionKind): string {
  switch (kind) {
    case "bash":       return "Run shell command?";
    case "file-write": return "Write file?";
    case "file-edit":  return "Edit file?";
    case "web-fetch":  return "Allow web request?";
    case "connector":  return "Call connector?";
    case "skill":      return "Run skill?";
  }
}

// ---------------------------------------------------------------------------
// Keyboard hints footer
// ---------------------------------------------------------------------------

const HINTS: readonly KeyHint[] = [
  { keys: "y",       action: "Allow once" },
  { keys: "Shift+Y", action: "Allow session" },
  { keys: "a",       action: "Allow always" },
  { keys: "n",       action: "Deny once" },
  { keys: "d",       action: "Deny always" },
  { keys: "Esc",     action: "Cancel" },
];

// ---------------------------------------------------------------------------
// Body preview — one renderer per kind
// ---------------------------------------------------------------------------

const RequestPreview: React.FC<{ request: PermissionRequest }> = ({ request }) => {
  const { colors } = useTheme();
  const body = request.body;

  switch (body.kind) {
    case "bash":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>Command</Text>
          <Text>{body.command}</Text>
          {body.cwd !== undefined && (
            <>
              <Text color={colors.muted}>Working directory</Text>
              <Text color={colors.dim}>{body.cwd}</Text>
            </>
          )}
        </Column>
      );
    case "file-write":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>Path</Text>
          <Text>{body.path}</Text>
          <Text color={colors.muted}>Size</Text>
          <Text color={colors.dim}>{`${body.byteCount.toLocaleString()} bytes`}</Text>
        </Column>
      );
    case "file-edit":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>Path</Text>
          <Text>{body.path}</Text>
          <Text color={colors.muted}>Change preview</Text>
          <Box>
            <Text color={colors.dim}>{body.diffPreview}</Text>
          </Box>
        </Column>
      );
    case "web-fetch":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>URL</Text>
          <Text>{body.url}</Text>
          <Text color={colors.muted}>Method</Text>
          <Text color={colors.dim}>{body.method}</Text>
        </Column>
      );
    case "connector":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>Connector</Text>
          <Text>{body.connectorId}</Text>
          <Text color={colors.muted}>Method</Text>
          <Text color={colors.dim}>{body.method}</Text>
        </Column>
      );
    case "skill":
      return (
        <Column gap="sm">
          <Text color={colors.muted}>Skill</Text>
          <Text>{body.skillId}</Text>
          {body.scriptPath !== undefined && (
            <>
              <Text color={colors.muted}>Script</Text>
              <Text color={colors.dim}>{body.scriptPath}</Text>
            </>
          )}
        </Column>
      );
  }
};

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export interface PermissionDialogProps {
  readonly request: PermissionRequest;
  readonly width?: number | string;
}

export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  request,
  width,
}) => {
  const intent = intentForRisk(request.risk);
  const title = titleForKind(request.body.kind);

  return (
    <Dialog intent={intent} title={title} width={width} hints={HINTS}>
      <Column gap="md">
        {/* Risk + agent line */}
        <Box flexDirection="row" gap={2}>
          <Badge intent={intent}>{labelForRisk(request.risk)}</Badge>
          <Text>{request.agent}</Text>
        </Box>

        {/* One-line summary */}
        <Text>{request.summary}</Text>

        <Divider tone="faint" />

        {/* Kind-specific body */}
        <RequestPreview request={request} />
      </Column>
    </Dialog>
  );
};
