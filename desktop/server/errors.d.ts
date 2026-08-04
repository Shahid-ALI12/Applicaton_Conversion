export declare class AppError extends Error {
    readonly status: number;
    readonly code: string;
    readonly fields?: Record<string, string>;
    private constructor();
    static badRequest(message: string, fields?: Record<string, string>): AppError;
    static unauthorized(message?: string): AppError;
    static forbidden(message?: string): AppError;
    static notFound(message?: string): AppError;
    static conflict(message: string): AppError;
    static tooManyRequests(message: string): AppError;
    static internal(message?: string): AppError;
}
