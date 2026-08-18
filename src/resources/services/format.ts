// Display formatting for attribute values. Attribute values are stored as strings;
// `numerise` turns one into a number for a numeric input, and `stringifyNumber` turns
// it back on edit. Used by the attribute window and the table-attribute dialog.

/**
 * Parse a stored attribute string into a number for display.
 * Empty / "not defined" / "undefined" values fall back to `defaultValue`
 * (or `fallbackValue` when no default is given), matching NumeriseConverter.toView.
 */
export function numerise(
  value: string,
  defaultValue?: number,
  fallbackValue?: number,
): number {
  if (value === "not defined" || value === "undefined" || value === "") {
    return defaultValue ?? (fallbackValue as number);
  }
  if (!value) {
    return defaultValue ?? (fallbackValue as number);
  }
  return parseFloat(value);
}

/** Inverse of `numerise` (NumeriseConverter.fromView): number back to string. */
export function stringifyNumber(value: number): string {
  return value.toString();
}
