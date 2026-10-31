import { createHmac, timingSafeEqual } from 'node:crypto';

export interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: string;
}

interface InteractiveReply {
  id: string;
  title: string;
}

interface WebhookMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    list_reply?: InteractiveReply;
    button_reply?: InteractiveReply;
  };
}

interface WebhookPayload {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: WebhookMessage[];
      };
    }[];
  }[];
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isValidSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signature || !appSecret) {
    return false;
  }
  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqual(signature, `sha256=${expected}`);
}

// Tocar una opcion de una lista o un boton equivale a escribirla. El id va en
// el texto porque el titulo llega recortado a lo que cabe en WhatsApp.
function toInboundMessage(message: WebhookMessage): InboundMessage {
  const { id, from, type, text, interactive } = message;
  const reply = interactive?.list_reply ?? interactive?.button_reply;
  return reply
    ? { id, from, type: 'text', text: `${reply.title} (opcion ${reply.id})` }
    : { id, from, type, text: text?.body };
}

// Solo mensajes de clientes hacia nuestro numero: una misma app de Meta puede
// recibir eventos de otros numeros, y las notificaciones de entrega traen
// `statuses` en vez de `messages`.
export function extractInboundMessages(
  payload: WebhookPayload,
  phoneNumberId: string,
): InboundMessage[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter(
      (change) =>
        change.field === 'messages' &&
        change.value?.metadata?.phone_number_id === phoneNumberId,
    )
    .flatMap((change) => change.value?.messages ?? [])
    .map(toInboundMessage);
}
