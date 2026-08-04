export interface PageParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function parsePage(query: Record<string, unknown>): { page: number; pageSize: number; search: string } {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 50)),
    search: String(query.search ?? '').trim(),
  };
}
