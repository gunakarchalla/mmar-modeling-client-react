import { API_URL } from "@/config";

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
