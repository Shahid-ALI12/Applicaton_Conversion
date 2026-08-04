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
export declare function parsePage(query: Record<string, unknown>): {
    page: number;
    pageSize: number;
    search: string;
};
