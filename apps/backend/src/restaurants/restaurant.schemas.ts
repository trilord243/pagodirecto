import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

// El portal le muestra estos mensajes al comercio.
z.config(z.locales.es());

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'ready',
  'delivered',
  'cancelled',
] as const;

export const PAYMENT_STATUSES = ['pending', 'paid'] as const;

export const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(80),
  password: z.string().min(1).max(200),
});

// Las mismas reglas que valida el portal.
export const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, 'Usuario inválido'),
  password: z.string().min(6).max(200),
});

const MenuItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  category: z.string().trim().max(80).nullish(),
  price: z.number().positive().max(10_000_000),
});

export type MenuItemInput = z.infer<typeof MenuItemSchema>;

export const CreateMenuItemSchema = MenuItemSchema;

export const UpdateMenuItemSchema = MenuItemSchema.partial()
  .extend({ available: z.boolean().optional() })
  .refine((patch) => Object.keys(patch).length > 0, 'Sin cambios');

export const PublishMenuSchema = z
  .object({
    currency: z.enum(['USD', 'VES']),
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          items: z
            .array(
              MenuItemSchema.omit({ category: true }).extend({
                available: z.boolean().default(true),
              }),
            )
            .min(1)
            .max(200),
        }),
      )
      .min(1)
      .max(50),
  })
  // Los platos se identifican por nombre: dos iguales se pisarian sin avisar.
  .superRefine(({ categories }, context) => {
    const seen = new Set<string>();
    for (const item of categories.flatMap(({ items }) => items)) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          message: `Hay dos productos llamados "${item.name}". Cámbiale el nombre a uno.`,
        });
      }
      seen.add(key);
    }
  });

export type PublishedMenu = z.infer<typeof PublishMenuSchema>;

export const UpdateOrderSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Sin cambios');

export const PlaceOrderSchema = z.object({
  restaurante: z.string().trim().toUpperCase().min(1).max(20),
  notas: z.string().trim().max(500).nullish(),
  usar_recompensa: z.boolean().optional(),
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

export const LoyaltyProgramSchema = z.object({
  stampsRequired: z.number().int().min(2).max(20),
  rewardItemId: z.number().int().positive(),
  active: z.boolean().default(true),
});

const PromotionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  percent: z.number().positive().max(100),
  minPurchases: z.number().int().min(0).max(1000).default(0),
  minTotal: z.number().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
});

export type PromotionInput = z.infer<typeof PromotionSchema>;

export const CreatePromotionSchema = PromotionSchema;

export const UpdatePromotionSchema = PromotionSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  'Sin cambios',
);

export const SendOptionsSchema = z.object({
  texto: z.string().trim().min(1).max(1024),
  boton: z.string().trim().min(1).max(20).optional(),
  opciones: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        titulo: z.string().trim().min(1).max(120),
        descripcion: z.string().trim().max(200).nullish(),
      }),
    )
    .min(2)
    .max(10),
});

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): z.output<Schema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map(({ message }) => message),
    );
  }
  return result.data;
}
