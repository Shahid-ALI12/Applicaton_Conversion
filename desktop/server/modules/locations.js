import { z } from 'zod';
import { createCrudRouter } from './crudFactory.js';
const createLocationSchema = z.object({
    name: z.string().min(1),
});
const updateLocationSchema = z.object({
    name: z.string().min(1).optional(),
});
export const locationsRouter = createCrudRouter({
    table: 'locations',
    listFields: 'id, name, created_at',
    searchFields: ['name'],
    createSchema: createLocationSchema,
    updateSchema: updateLocationSchema,
    orderBy: 'name ASC',
});
//# sourceMappingURL=locations.js.map