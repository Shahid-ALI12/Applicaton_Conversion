import { apiFetch } from "./api";
/**
 * Shared Excel (XLSX) download utilities.
 *
 * Why a dedicated module:
 *  - Single source of truth for the Excel download pattern (avoids copy-paste drift
 *    between Dashboard and Day Reconciliation detail panels).
 *  - Provides `downloadAllExcelPaged()` which walks paginated API endpoints
 *    server-side so the user gets EVERY record in the workbook, not just the
 *    currently visible 10.
 *
 * Safe to call in the browser only (uses `document` / `Blob` / `URL`).
 */

export type Col = {
  key: string;
  label: string;
  align?: "left" | "right";
  /**
   * Optional formatter. Receives the raw cell value plus the full row so
   * computed columns (key starts with `_`) can use other fields.
   */
  fmt?: (value: any, row: Record<string, any>) => string;
};

/**
 * Build an XLSX workbook from the given rows + column schema and trigger a
 * browser download. Dynamically imports `xlsx` so the library is only loaded
 * when the user actually clicks "Download Excel".
 */
export async function downloadExcel(
  rows: Record<string, any>[],
  cols: Col[],
  fileName: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const headers = cols.map((c) => c.label);
  const data = rows.map((row) =>
    cols.map((c) => {
      const raw = row[c.key];
      return c.fmt ? c.fmt(raw, row) : String(raw ?? "");
    }),
  );
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, `${fileName.replace(/\s+/g, "_")}.xlsx`);
}

/**
 * Fetch ALL records from a paginated endpoint by walking pages server-side,
 * then trigger a single XLSX download of the merged result.
 *
 * Why this exists:
 *  - User wants "Download Excel" to download EVERY record in the database,
 *    not just the current visible page.
 *  - We don't bypass pagination by raising pageSize to 9999 (the backend caps
 *    at 200 per request) — instead we loop pages transparently.
 *
 * The endpoint must return JSON in the shape:
 *   { rows: [...], total, page, pageSize, totalPages }
 * OR (legacy / non-paginated shape):
 *   { rows: [...] }
 * Both shapes are handled gracefully.
 *
 * @param baseUrl   e.g. "/api/reports/dashboard/details"
 * @param baseParams  base query params merged into each paged request
 *                    (e.g. { type: "sales-today", date: "2024-01-01" })
 *                    — DO NOT include page/pageSize here, they are added per request.
 * @param cols      Column schema (same shape used by the table renderer).
 * @param fileName  e.g. "Sales Today"  (extension auto-added).
 *
 * @returns the merged array (also triggers a download)
 */
export async function downloadAllExcelPaged(
  baseUrl: string,
  baseParams: Record<string, string> = {},
  cols: Col[],
  fileName: string,
): Promise<Record<string, any>[]> {
  const all: Record<string, any>[] = [];
  let page = 1;
  const pageSize = 200; // backend cap
  let totalPages = 1;

  while (page <= totalPages) {
    const qs = new URLSearchParams({
      ...baseParams,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await apiFetch(`${baseUrl}?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as any)?.error || `Download failed: ${res.status}`,
      );
    }
    const body = await res.json();
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    all.push(...rows);
    totalPages =
      typeof body?.totalPages === "number" ? body.totalPages : 1;
    if (rows.length === 0) break; // safety
    page += 1;
  }

  await downloadExcel(all, cols, fileName);
  return all;
}
