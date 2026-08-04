import { Router } from 'express';
import { z } from 'zod';
interface CrudConfig {
    table: string;
    listFields?: string;
    searchFields?: string[];
    createSchema: z.ZodType;
    updateSchema: z.ZodType;
    orderBy?: string;
    extraWhere?: string;
    afterCreate?: (id: number, body: Record<string, unknown>) => void;
    afterUpdate?: (id: number, body: Record<string, unknown>) => void;
    beforeDelete?: (id: number) => void;
}
export declare function createCrudRouter(config: CrudConfig): Router;
export {};
