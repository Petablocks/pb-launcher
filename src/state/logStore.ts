import { useSyncExternalStore } from "react";
import { GameLogLine } from "../launch";

/**
 * Game output lives outside React state: batches arrive several times a second during a
 * modded startup and only the log drawer needs to re-render for them.
 */
const MAX_LINES = 2000;
const EMPTY: readonly GameLogLine[] = [];

const logs = new Map<string, readonly GameLogLine[]>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function appendLogs(instanceId: string, lines: GameLogLine[]) {
  if (lines.length === 0) return;
  const prev = logs.get(instanceId) ?? EMPTY;
  const next = prev.concat(lines);
  logs.set(instanceId, next.length > MAX_LINES ? next.slice(-MAX_LINES) : next);
  notify();
}

export function clearLogs(instanceId: string) {
  if (!logs.has(instanceId)) return;
  logs.delete(instanceId);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGameLogs(instanceId: string): readonly GameLogLine[] {
  return useSyncExternalStore(subscribe, () => logs.get(instanceId) ?? EMPTY);
}
