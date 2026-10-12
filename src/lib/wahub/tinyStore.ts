/**
 * A value kept outside the screen that shows it, so work that takes the server
 * a long while — the bot thinking over an explanation, a run of a hundred test
 * conversations — goes on when its sub-tab is left, and is found as it stands
 * when the sub-tab is opened again. React reads it with `useSyncExternalStore`.
 */
export interface TinyStore<T> {
  get: () => T;
  /** A new value, or a change to the one there. Setting the same value tells nobody. */
  set: (next: T | ((current: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createTinyStore<T>(initial: T): TinyStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
