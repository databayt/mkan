/**
 * Mkan's WhatsApp line, where tenants chat with the same agent as /find
 * (/api/whatsapp/hook → wa-tenant.ts). "Continue on WhatsApp"
 * carries the chat over: `ref:<task id>` starts the phone's chat from this one.
 */
export const MKAN_WA_NUMBER = "250780984777";

export const continueOnWhatsApp = (taskId: string | null | undefined, words: string) =>
  `https://wa.me/${MKAN_WA_NUMBER}?text=${encodeURIComponent(taskId ? `${words} ref:${taskId}` : words)}`;
