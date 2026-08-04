export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  private constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message: string, fields?: Record<string, string>): AppError {
    return new AppError(400, 'BAD_REQUEST', message, fields);
  }

  static unauthorized(message = 'Login zaruri hai.'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Aap ko ye permission nahi hai.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Record nahi mila.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }

  static tooManyRequests(message: string): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Server mein error aaya.'): AppError {
    return new AppError(500, 'INTERNAL', message);
  }
}
