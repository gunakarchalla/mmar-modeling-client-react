// Central runtime configuration. All services must import from here
// (never read process.env / import.meta.env directly elsewhere).
//
// WORKAROUND — LAN collaboration testing, no reverse proxy.
//
// The backends are addressed as ABSOLUTE URLs on their own published ports, with
// the HOST derived from the page's own host at runtime. `.env` names localhost
// because that is where the servers run, but `localhost` is resolved by the
// BROWSER — so on a second device opening http://192.168.1.42:8085 every call
// would go to THAT device. Swapping in `location.hostname` makes the app work
// from any device on the network with no per-network configuration.
//
// LIMITATION — THIS IS HTTP-ONLY, BY CONSTRUCTION.
// Only the hostname is swapped; the scheme is deliberately left alone. On an
// https:// page these stay http:// / ws://, which browsers hard-block as mixed
// content. Deriving the scheme instead would not help: neither mmar-server nor
// mmar-sync-server terminates TLS (no https.createServer in either), so
// https://<host>:8000 would just fail the handshake. There is no single place to
// terminate TLS while the clients and backends live on separate ports — that is
// what a reverse proxy in front of all of them is for. Serve this over plain
// HTTP on a trusted LAN, and put a proxy in front before going near TLS.

/**
 * Hosts that can only ever mean "the machine running the browser". A backend URL
 * pointing at one of these is unreachable from any OTHER device on the network.
 */
const LOCAL_ONLY_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * Point a configured backend URL at the host the page was actually served from.
 *
 * Scheme, port and path are preserved — only the hostname changes — so the
 * path survives the rewrite. A value naming a real host is honoured verbatim, so
 * pointing at a remote backend still works.
 *
 * @param configured - the URL from VITE_API_URL / VITE_SYNC_URL.
 * @param pageHost - `location.hostname`, or undefined where there is no DOM.
 */
export function resolveBackendUrl(configured: string, pageHost: string | undefined): string {
  if (pageHost === undefined) return configured;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return configured;
  }

  if (!LOCAL_ONLY_HOSTS.has(url.hostname) || LOCAL_ONLY_HOSTS.has(pageHost)) {
    return configured;
  }

  url.hostname = pageHost;
  // URL.toString() appends a root "/" that callers concatenate onto
  // (`${API_URL}/${path}`), which would produce a "//" path.
  return url.toString().replace(/\/$/, "");
}

/** `location.hostname` in the browser; undefined under vitest's node env. */
const PAGE_HOST = typeof window === "undefined" ? undefined : window.location.hostname;

// REST API (mmar-server).
export const API_URL: string = resolveBackendUrl(
  import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  PAGE_HOST,
);

// WebSocket sync server (mmar-sync-server) for real-time collaboration (yjs).
export const SYNC_URL: string = resolveBackendUrl(
  import.meta.env.VITE_SYNC_URL ?? "ws://localhost:8060",
  PAGE_HOST,
);

// Optional dev-only sign-in autofill. The old client prefilled the login form
// from process.env.USERNAME / process.env.PASSWORD; here the SignInDialog reads
// these (unset in production) so a developer can skip typing admin/admin.
export const DEV_USERNAME: string | undefined = import.meta.env.VITE_USERNAME;
export const DEV_PASSWORD: string | undefined = import.meta.env.VITE_PASSWORD;
