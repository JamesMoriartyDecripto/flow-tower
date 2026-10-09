import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { TowerSchema } from '../src/core/schema.ts';

const json = z.toJSONSchema(TowerSchema, { io: 'input', unrepresentable: 'any' });
writeFileSync('schema/flow-tower.schema.json', JSON.stringify({ title: 'Flow Tower', ...json }, null, 2) + '\n');
console.log('schema/flow-tower.schema.json written');
