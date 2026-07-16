// Framework-agnostic access-token holder.
//
// The old client kept the JWT on `globalObjectInstance.accessToken` and mirrored
// it into `localStorage["jwtToken"]` (see dialogs/user-management/user-management.ts).
// In the React port the engine does not exist yet (it arrives in P2), so plain TS
// code that needs the token — `backend-service.ts`, and later the engine's
// `globalObject.accessToken` getter — reads it from here instead.
//
// `authStore` is the single writer: it calls `setToken` on login/restore and
// `clearToken` on logout. Everything else only reads via `getToken`.
//
// localStorage access is guarded so this module can be imported in a non-DOM
// (node/vitest) context without throwing at load time.

const STORAGE_KEY = "jwtToken";

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// In-memory mirror, seeded from localStorage so a page reload keeps the session.
let cached: string | null = readStorage();

export function getToken(): string | null {
  return cached;
}

export function setToken(token: string): void {
  cached = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* no-op outside the browser */
  }
}

export function clearToken(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op outside the browser */
  }
}
