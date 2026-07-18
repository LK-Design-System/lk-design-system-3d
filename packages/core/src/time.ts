import { assertValidClockId, clockId, type ClockId } from "./identifiers.js";

export { clockId };
export type { ClockId };

export interface Timestamp {
  readonly clock: ClockId;
  readonly sec: number;
  readonly nsec: number;
}

export class TimestampValidationError extends RangeError {
  override readonly name: string = "TimestampValidationError";
}

export function timestamp(clock: ClockId, sec: number, nsec: number): Timestamp {
  assertValidClockId(clock);
  if (!Number.isFinite(sec) || !Number.isInteger(sec)) {
    throw new TimestampValidationError("sec must be a finite integer");
  }
  if (!Number.isFinite(nsec) || !Number.isInteger(nsec) || nsec < 0 || nsec >= 1_000_000_000) {
    throw new TimestampValidationError(
      "nsec must be an integer in the range 0 <= nsec < 1_000_000_000",
    );
  }
  return Object.freeze({ clock, sec, nsec });
}
