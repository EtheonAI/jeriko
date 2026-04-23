/**
 * Permission Subsystem — public barrel.
 */

// --- Types ------------------------------------------------------------------
export type {
  BashRequestBody,
  ConnectorRequestBody,
  FileEditRequestBody,
  FileWriteRequestBody,
  PermissionDecision,
  PermissionKind,
  PermissionRequest,
  PermissionRequestBody,
  PermissionRule,
  PermissionSnapshot,
  RiskLevel,
  SkillRequestBody,
  WebFetchRequestBody,
} from "./types.js";
export {
  PERMISSION_DECISIONS,
  PERMISSION_KINDS,
  RISK_LEVELS,
  isAllow,
  persistsInSession,
  persistsToDisk,
} from "./types.js";

// --- Matcher ----------------------------------------------------------------
export type { AutoDecision, MatchInput } from "./matcher.js";
export { evaluate, targetFor, targetMatches } from "./matcher.js";

// --- Store ------------------------------------------------------------------
export type { PermissionStore, StoreOptions } from "./store.js";
export { createPermissionStore } from "./store.js";

// --- Config -----------------------------------------------------------------
export type {
  ConfigDiagnostic,
  LoadResult,
  LoaderIO,
  SaveResult,
} from "./config.js";
export { loadPermissions, savePermissions } from "./config.js";
export type { PermissionConfig, PersistedRule } from "./schema.js";
export { permissionConfigSchema, persistedRuleSchema } from "./schema.js";

// --- Bridge -----------------------------------------------------------------
export type {
  InMemoryBridge,
  PermissionBridge,
  PermissionRequestHandler,
} from "./bridge.js";
export { createAutoApproveBridge, createInMemoryBridge } from "./bridge.js";

// --- Provider + hooks -------------------------------------------------------
export {
  PermissionProvider,
  usePermissionQueue,
  usePermissionRules,
  usePermissionSnapshot,
  usePermissionStore,
} from "./provider.js";
export type { PermissionProviderProps } from "./provider.js";

// --- Components -------------------------------------------------------------
export { PermissionDialog } from "./PermissionDialog.js";
export type { PermissionDialogProps } from "./PermissionDialog.js";
export { PermissionOverlay } from "./PermissionOverlay.js";
