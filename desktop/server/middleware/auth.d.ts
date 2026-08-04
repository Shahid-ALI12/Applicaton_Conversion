import type { NextFunction, Request, Response } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: number;
                role: 'admin' | 'operator';
                name: string;
                isActive: boolean;
            };
        }
    }
}
export declare function requireAuth(req: Request, _res: Response, next: NextFunction): void;
export declare function requireAdmin(req: Request, _res: Response, next: NextFunction): void;
