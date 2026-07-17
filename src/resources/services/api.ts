import { API_URL } from "@/config";

/**
 * Error carrying the HTTP status, for the few callers that must branch on it.
 *
 * Most backend-service methods follow P1's convention: log the failure and resolve to
 * `undefined` / `[]`, mirroring how the old views defended each call. The old
 * generated fetchHelper instead threw an `ApiException` with a `.status` for EVERY
 * endpoint, and one ported view — the P10 share dialog — genuinely reads it, to tell
 * "User not found" (404) and "Cannot remove the last delete owner" (409) apart from a
 * generic failure. The three endpoints it calls throw this instead of swallowing; see
 * state.json → discoveries (P10).
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Small fetch wrapper replacing the Aurelia HttpClient configuration
 * (fetchHelper.setUpHttpClient). Prefixes API_URL and merges the same default
 * headers the original client used. Sets Content-Type: application/json for
 * requests with a JSON body so the server's express.json() parses req.body;
 * callers add Authorization. For FormData (multipart file uploads) we must NOT
 * set Content-Type — the browser sets it together with the multipart boundary,
 * which multer needs to parse the upload.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "Fetch",
    ...(init.body != null && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  return fetch(`${API_URL}/${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });
}
