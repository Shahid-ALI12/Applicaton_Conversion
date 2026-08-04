import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

export function validateBody(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'root';
        fields[key] = issue.message;
      }
      throw Object.assign(new Error('Validation fail hui.'), { status: 422, code: 'VALIDATION', fields });
    }
    req.body = result.data;
    next();
  };
}
