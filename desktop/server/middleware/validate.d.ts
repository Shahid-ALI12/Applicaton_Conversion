import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
export declare function validateBody(schema: z.ZodType): (req: Request, _res: Response, next: NextFunction) => void;
