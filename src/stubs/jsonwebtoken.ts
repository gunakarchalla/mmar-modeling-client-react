// Browser stub for the Node-only `jsonwebtoken` package.
//
// The shared `mmar-global-data-structure` `User` DTO statically imports
// `jsonwebtoken` for its server-side `generate_token()` (jwt.sign) helper.
// That pulls Node's `buffer`/`crypto` into the browser bundle, which Vite
// externalizes and which then crashes at load (`Buffer.from` on undefined).
//
// The client never signs tokens (it only decodes them via `jwt-decode`), so
// we alias `jsonwebtoken` to this no-op stub. Calling `sign`/`verify` in the
// browser is unsupported and throws loudly instead of failing silently.
function unsupported(): never {
  throw new Error(
    "jsonwebtoken is not available in the browser. Token signing/verification is server-side only.",
  );
}

export const sign = unsupported;
export const verify = unsupported;
export const decode = unsupported;

export default { sign, verify, decode };
