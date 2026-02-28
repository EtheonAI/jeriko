// Layer 0 — Approval gate for high-risk operations.

import type { RiskLevel } from "../../shared/types.js";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  id: string;
  agent: string;
  command: string;
  risk: RiskLevel;
  reason: string;
  created_at: string;
  expires_at: string;
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

interface StoredApproval {
  request: ApprovalRequest;
  status: ApprovalStatus;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How long an approval request stays valid before auto-expiring (ms). */
const APPROVAL_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Internal store
// ---------------------------------------------------------------------------

const store = new Map<string, StoredApproval>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoExpiry(): string {
  return new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
}

/**
 * Check and mark expired requests. Called before reads.
 */
function expireStale(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.status === "pending" && new Date(entry.request.expires_at).getTime() <= now) {
      entry.status = "expired";
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new approval request for a high-risk command.
 * Returns the request immediately with status "pending".
 * The caller should await approval before executing the command.
 */
export async function requestApproval(
  agent: string,
  command: string,
  risk: RiskLevel,
): Promise<ApprovalRequest> {
  const request: ApprovalRequest = {
    id: generateId(),
    agent,
    command,
    risk,
    reason: `Agent "${agent}" requests approval for: ${command}`,
    created_at: isoNow(),
    expires_at: isoExpiry(),
  };

  store.set(request.id, { request, status: "pending" });
  return request;
}

/**
 * Approve a pending request by ID.
 * Throws if the request doesn't exist or is not pending.
 */
export function approveRequest(id: string): void {
  expireStale();
  const entry = store.get(id);
  if (!entry) {
    throw new Error(`Approval request not found: ${id}`);
  }
  if (entry.status !== "pending") {
    throw new Error(`Cannot approve request with status "${entry.status}": ${id}`);
  }
  entry.status = "approved";
}

/**
 * Deny a pending request by ID.
 * Throws if the request doesn't exist or is not pending.
 */
export function denyRequest(id: string): void {
  expireStale();
  const entry = store.get(id);
  if (!entry) {
    throw new Error(`Approval request not found: ${id}`);
  }
  if (entry.status !== "pending") {
    throw new Error(`Cannot deny request with status "${entry.status}": ${id}`);
  }
  entry.status = "denied";
}

/**
 * Get all currently pending approval requests.
 * Expired requests are filtered out.
 */
export function getPendingApprovals(): ApprovalRequest[] {
  expireStale();
  const pending: ApprovalRequest[] = [];
  for (const entry of store.values()) {
    if (entry.status === "pending") {
      pending.push(entry.request);
    }
  }
  return pending;
}

/**
 * Get the status of a specific approval request.
 */
export function getApprovalStatus(id: string): ApprovalStatus | undefined {
  expireStale();
  return store.get(id)?.status;
}

/**
 * Clear all approval records. Useful for testing.
 */
export function clearApprovals(): void {
  store.clear();
}
