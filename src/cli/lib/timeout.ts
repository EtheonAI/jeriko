/**
 * Timeout utility — wraps promises with descriptive timeout errors.
 *
 * Used by slash command dispatch and backend calls to prevent
 * the CLI from hanging indefinitely on unresponsive backends.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s`);
    this.name = "TimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout.
 *
 * @param promise   The async operation to wrap
 * @param ms        Timeout in milliseconds
 * @param label     Human-readable label for the error message
 * @returns         The resolved value of the promise
 * @throws          TimeoutError if the timeout fires first
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
