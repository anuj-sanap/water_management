import { z } from 'zod';

const supplyDateSchema = z
  .iso.date('Enter a valid delivery date.')
  .refine((date) => date <= new Date().toISOString().slice(0, 10), {
    message: 'Delivery date cannot be in the future.',
  });

const supplySourceSchema = z.enum([
  'TANKER',
  'MUNICIPAL',
  'BOREWELL',
  'STORAGE_TRANSFER',
  'OTHER',
]);

const supplyUnitSchema = z.enum(['M3', 'L']);

const optionalTextSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Must be ${maxLength} characters or fewer.`)
    .optional()
    .transform((value) => value || null);

export const supplyInputSchema = z.object({
  projectId: z.string().min(1, 'Project is required.'),
  date: supplyDateSchema,
  source: supplySourceSchema,
  enteredVolume: z.coerce
    .number({ error: 'Enter a valid volume.' })
    .finite('Enter a valid volume.')
    .positive('Volume must be greater than zero.'),
  enteredUnit: supplyUnitSchema,
  supplier: optionalTextSchema(120),
  referenceNo: optionalTextSchema(80),
  notes: optionalTextSchema(1000),
});

export const supplyImportRowSchema = z.object({
  date: supplyDateSchema,
  source: supplySourceSchema,
  enteredVolume: z.coerce
    .number({ error: 'Enter a valid volume.' })
    .finite('Enter a valid volume.')
    .positive('Volume must be greater than zero.'),
  enteredUnit: supplyUnitSchema,
  supplier: optionalTextSchema(120),
  referenceNo: optionalTextSchema(80),
  notes: optionalTextSchema(1000),
});

export const supplyPreviewSchema = z.object({
  projectId: z.string().min(1),
  volume: z.coerce.number().finite().positive(),
  unit: z.enum(['m3', 'L']),
});
