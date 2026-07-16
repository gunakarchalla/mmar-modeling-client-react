// Plain-function replacements for the Aurelia value converters
// (resources/services/value_converters.ts). The old `numerise` value converter
// was used in attribute-window.html and dialog-table-attribute.html to turn a
// stored string into a number for display and back to a string on edit.
//
// Aurelia's `x | numerise:default:fallback` becomes `numerise(x, default, fallback)`
// in JSX, and the `fromView` direction becomes `stringifyNumber(n)`.

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
