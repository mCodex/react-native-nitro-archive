/** Validates numbers before they can be truncated by a native integer conversion. */
export function assertInteger(value: number, name: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

/** The number-based bridge cannot represent byte counts above this exact range. */
export function toNativeByteCount(value: bigint | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "bigint" || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${name} must be a positive bigint no greater than Number.MAX_SAFE_INTEGER.`);
  }

  return Number(value);
}
