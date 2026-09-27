import {
  projectLogicalEvents,
  type LogicalTraceEvent,
} from "../checks/logical-events.js";
import { TreeBuilder } from "../logs/tree-builder.js";
import type { InspectRunTree } from "../types/inspect-event.js";
import type { PersistedInspectEvent } from "../types/persisted-inspect-event.js";
import type { TraceEvent } from "../types.js";

import { traceEventsToPersistedInspectEvents } from "./from-trace-event.js";
import { persistedInspectEventsToInspectEvents } from "./to-inspect-event.js";

export interface PersistedTreeBridgeOptions {
  /**
   * If true, invalid persisted events are skipped.
   * If false or omitted, invalid persisted events throw.
   */
  skipInvalid?: boolean;
  /**
   * When true, pair v0.1 start/complete lifecycle rows into logical events
   * before tree construction (CLI export fidelity). Schema 1.0 completed-only
   * rows are unchanged. Yields one RUN span per run when run_started+completed
   * pair, and one span per logical tool/step.
   */
  coalesceLifecycle?: boolean;
}

function logicalToPersisted(event: LogicalTraceEvent): PersistedInspectEvent {
  const { sourceEventIds: _sourceEventIds, projection: _projection, ...rest } =
    event;
  return rest;
}

/**
 * Builds {@link InspectRunTree} rows from v0.2 {@link PersistedInspectEvent} input.
 * Uses {@link TreeBuilder} as the canonical tree builder. Does not mutate `events`.
 */
export function persistedInspectEventsToRunTrees(
  events: readonly PersistedInspectEvent[],
  options?: PersistedTreeBridgeOptions,
): InspectRunTree[] {
  const sourceEvents =
    options?.coalesceLifecycle === true
      ? projectLogicalEvents(events).logicalEvents.map(logicalToPersisted)
      : events;
  const inspectEvents = persistedInspectEventsToInspectEvents(sourceEvents, {
    skipInvalid: options?.skipInvalid,
  });
  return new TreeBuilder().build(inspectEvents);
}

/**
 * Builds {@link InspectRunTree} rows from legacy v0.1 {@link TraceEvent} input
 * via the persisted-event model. Does not mutate `events`.
 */
export function traceEventsToPersistedRunTrees(
  events: readonly TraceEvent[],
  options?: PersistedTreeBridgeOptions,
): InspectRunTree[] {
  const persisted = traceEventsToPersistedInspectEvents(events);
  return persistedInspectEventsToRunTrees(persisted, options);
}
