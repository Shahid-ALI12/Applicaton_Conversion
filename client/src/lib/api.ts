const TOKEN_KEY = 'dcf.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });

  if (res.status === 401 && !url.includes('/auth/login')) {
    setToken(null);
    window.location.assign('/login');
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
  }

  if (res.status === 403) {
    const probe = await res.clone().json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    const code = probe.error?.code;
    if ((code === 'LICENSE_EXPIRED' || code === 'LICENSE_TAMPERED') && window.location.pathname !== '/license') {
      window.location.assign('/license');
      throw new ApiError(403, code!, probe.error?.message ?? 'License expired');
    }
  }

  const data = await res.json().catch(() => ({})) as T & { error?: { code?: string; message?: string; fields?: Record<string, string> } };
  if (!res.ok) {
    throw new ApiError(res.status, data.error?.code ?? 'ERROR', data.error?.message ?? 'Request failed', data.error?.fields);
  }
  return data;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Auth-aware fetch wrapper for cases where the caller needs the raw Response
 * (e.g., to check status manually, read body as text, etc.).
 * Automatically adds the Bearer token header and Content-Type for JSON bodies.
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Only set Content-Type: application/json for non-FormData bodies.
  // FormData must NOT have Content-Type set manually — the browser needs
  // to set it automatically with the correct multipart/form-data boundary.
  // (Setting application/json on a FormData body causes express.json() to
  // try parsing the multipart payload as JSON → "Unexpected token '-'" error.)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}
