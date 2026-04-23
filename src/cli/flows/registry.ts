/**
 * Flow registry — runtime catalog of available WizardFlows.
 *
 * A flow is identified by a stable id; slash commands resolve the id to a
 * factory and invoke it with the caller's FlowContext. The registry is a
 * Map<id, factory>; registration is explicit (no auto-discovery, no file
 * scanning — flows compose into the app deliberately).
 *
 * Keep this module dependency-free aside from ./types — flows themselves
 * live in sibling modules and register via registerFlow().
 */

import type { FlowContext, WizardFlow } from "./types.js";

export type FlowFactory<T> = (ctx: FlowContext) => WizardFlow<T>;

// Private map; registry can't be enumerated outside module boundaries.
const flows: Map<string, FlowFactory<unknown>> = new Map();

export class DuplicateFlowError extends Error {
  public readonly flowId: string;
  constructor(id: string) {
    super(`Flow with id "${id}" is already registered`);
    this.name = "DuplicateFlowError";
    this.flowId = id;
  }
}

export class UnknownFlowError extends Error {
  public readonly flowId: string;
  constructor(id: string) {
    super(`No flow registered with id "${id}"`);
    this.name = "UnknownFlowError";
    this.flowId = id;
  }
}

/**
 * Register a flow factory under a stable id. Returns an unregister handle —
 * plugins and tests use it for cleanup. Throws on duplicate ids.
 */
export function registerFlow<T>(id: string, factory: FlowFactory<T>): () => void {
  if (flows.has(id)) throw new DuplicateFlowError(id);
  flows.set(id, factory as FlowFactory<unknown>);
  return () => {
    if (flows.get(id) === (factory as FlowFactory<unknown>)) flows.delete(id);
  };
}

/**
 * Look up a flow factory by id. Throws when absent — callers that
 * conditionally want a flow should probe with `hasFlow(id)` first.
 */
export function getFlow(id: string): FlowFactory<unknown> {
  const factory = flows.get(id);
  if (factory === undefined) throw new UnknownFlowError(id);
  return factory;
}

/** Test for the presence of a flow without throwing. */
export function hasFlow(id: string): boolean {
  return flows.has(id);
}

/** Stable-order listing of every registered flow id. */
export function listFlowIds(): readonly string[] {
  return [...flows.keys()];
}
