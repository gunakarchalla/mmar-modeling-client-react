import type { Attribute } from "@gds";
import { logger } from "./logger";

/**
 * The metamodel constraints the client checks BEFORE the server does.
 *
 * Everything the user builds is validated again by the server's rule engine, which
 * answers a violation with a 403. For a scene edit that 403 is expensive: the whole
 * scene is rolled back to the last saved snapshot and re-imported, which pulls every
 * object out of the THREE scene and leaves the selection, the transform controls and
 * the relation lines pointing at meshes that are gone. Catching the violation here
 * keeps the refused value out of the model in the first place, and reports it the way
 * every other metamodel rejection is reported — the error snackbar.
 */

/** Message shown when the metamodel forbids what the user is doing. */
export const NOT_ALLOWED_MESSAGE = "This action is not allowed due to some restrictions in the metamodel!";

/**
 * Report a refused action: an "error" entry, which the log store raises as the
 * snackbar, and a "close" entry for the log window — which carries `detail` when there
 * is one, so the panel says WHICH value was refused while the snackbar stays short.
 */
export function reportMetamodelViolation(detail?: string): void {
  logger.log(NOT_ALLOWED_MESSAGE, "error");
  logger.log(detail ? `${NOT_ALLOWED_MESSAGE} ${detail}` : NOT_ALLOWED_MESSAGE, "close");
}

/**
 * Whether `value` satisfies the regular expression of the attribute type the meta
 * attribute belongs to — letters typed into a Float attribute do not.
 *
 * This mirrors the server's `regexExValidator` rule deliberately closely: the same
 * "gmi" flags, the same `String(value).match(...)` test, and the same two cases that
 * are accepted without being tested at all — an attribute type that states no regex,
 * and an instance carrying no value. Anything accepted here and refused there comes
 * back as the 403 described above, so the two must not drift apart.
 */
export function attributeValueMatchesRegex(
  value: string | null | undefined,
  metaAttribute: Attribute | null | undefined,
): boolean {
  const regexValue = metaAttribute?.attribute_type?.regex_value;
  if (!regexValue) return true;
  if (value === null || value === undefined) return true;

  let regex: RegExp;
  try {
    // `regex_value` is declared a RegExp in gds but arrives from the API as a string.
    // The RegExp constructor accepts either, and applies the server's flags to both.
    regex = new RegExp(regexValue as unknown as string, "gmi");
  } catch {
    // A pattern the browser cannot compile is not a constraint this client can
    // enforce — let the edit through and leave the verdict to the server.
    return true;
  }

  return String(value).match(regex) !== null;
}

/** The attribute type's name ("Float"), for the log-window detail line. */
export function attributeTypeName(metaAttribute: Attribute | null | undefined): string {
  return metaAttribute?.attribute_type?.name ?? "attribute";
}
