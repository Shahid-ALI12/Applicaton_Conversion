import { apiFetch } from "./api";
/**
 * Triggers a client-side download of arbitrary JSON-serializable data.
 *
 * Usage:
 *   downloadJson(rows, "all-customers.json");
 *   downloadJson({ sales, generatedAt: new Date().toISOString() }, "sales-export.json");
 *
 * Safe to call in the browser only (uses `document` / `Blob` / `URL`).
 *
 * Why a dedicated util:
 * - Single source of truth for the JSON download pattern (avoids copy-paste drift).
 * - Always pretty-prints with 2-space indent so the file is human-readable.
 * - Triggers a real download (anchor + click), not a data URL.
 */
export function downloadJson(data: unknown, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    // SSR safety — no-op on server
    return;
  }

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL after a tick so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Fetches ALL records for a paginated endpoint by walking pages server-side,
 * then triggers a single JSON download of the merged result.
 *
 * Why this exists:
 * - User wants "Download JSON" to download EVERY record in the database, not
 *   just the current visible page.
 * - We don't bypass pagination by raising pageSize to 9999 (the backend caps
 *   at 200 per request) — instead we loop pages transparently.
 *
 * @param baseUrl  e.g. "/api/customers" (without query string)
 * @param params   extra query params merged into each paged request
 *                 (e.g. { active: "true", search: "ali" })
 * @param filename e.g. "all-customers.json"
 * @param dataKey  the JSON key under which the row array lives in the
 *                 response body (e.g. "customers", "sales", "orders")
 *
 * @returns the merged array (also triggers a download)
 */
export async function downloadAllJson(
  baseUrl: string,
  params: Record<string, string> = {},
  filename: string,
  dataKey: string,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const pageSize = 200; // max backend cap
  let totalPages = 1;

  while (page <= totalPages) {
    const qs = new URLSearchParams({
      ...params,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await apiFetch(`${baseUrl}?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error || `Download failed: ${res.status}`);
    }
    const body = await res.json();
    const rows: any[] = Array.isArray(body?.[dataKey]) ? body[dataKey] : [];
    all.push(...rows);
    totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
    if (rows.length === 0) break; // safety
    page += 1;
  }

  downloadJson(all, filename);
  return all;
}
