import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'ready',
  'delivered',
  'cancelled',
] as const;

export const LoginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

const MenuItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  category: z.string().trim().max(80).nullish(),
  price: z.number().min(0).max(10_000_000),
});

export type MenuItemInput = z.infer<typeof MenuItemSchema>;

export const CreateMenuItemSchema = MenuItemSchema;

export const ConfirmMenuSchema = z.object({
  currency: z.string().trim().toUpperCase().min(1).max(8).optional(),
  items: z.array(MenuItemSchema).min(1).max(500),
});

export const UpdateMenuItemSchema = MenuItemSchema.partial()
  .extend({ available: z.boolean().optional() })
  .refine((patch) => Object.keys(patch).length > 0, 'Sin cambios');

export const UpdateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const PlaceOrderSchema = z.object({
  restaurante: z.string().trim().min(1).max(80),
  nombre_cliente: z.string().trim().min(1).max(120),
  notas: z.string().trim().max(500).nullish(),
  items: z
    .array(
      z.object({
        item_id: z.number().int().positive(),
        cantidad: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(50),
});

export type PlaceOrderInput = z.infer<typeof PlaceOrderSchema>;

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): z.output<Schema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(z.prettifyError(result.error));
  }
  return result.data;
}
