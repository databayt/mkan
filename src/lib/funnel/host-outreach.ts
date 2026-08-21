/**
 * MKAN Host Funnel & WhatsApp Outreach Engine
 * 
 * Implements the 4-Beat Value Handover for Hosts:
 * Beat 1: What is MKAN in short (zero commission, trusted local booking)
 * Beat 2: Your property is ready & live (link + photos + details)
 * Beat 3: Handover offer (manage bookings directly on your WhatsApp)
 * Beat 4: Low-friction CTA (confirm to activate)
 */

export interface HostOutreachData {
  account: string;
  listingId: string;
  hostNameAr: string;
  hostNameEn: string;
  propertyName: string;
  zoneAr: string;
  priceSdg: number;
  phone: string | null;
  listingUrl: string;
}

/**
 * Compiles the first touch WhatsApp / chatbot introductory message for a host.
 */
export function compileHostFirstMessage(data: HostOutreachData): string {
  return `السلام عليكم ورحمة الله أستاذ ${data.hostNameAr}،

معاك فريق منصة «مكان» (mkan.sd) — المنصة السودانية الأولى لحجز الشقق المفروشة والإقامات الموثوقة مباشرة بين المضيف والنزيل.

أضفنا عقارك المميز «${data.propertyName}» (${data.zoneAr}) على المنصة وجهزنا صفحته بالكامل مع الصور والوصف:
🔗 ${data.listingUrl}

حابين نسلمك حساب المضيف الخاص بك لتستلم طلبات الحجز والتواصل مع الضيوف مباشرة على رقم الواتساب الخاص بك وبدون أي عمولة (0%).

لتفعيل استلام الحجوزات أو تحديث الأسعار والتوافر، فقط رد علينا بتأكيد وسنربط رقمك فوراً لإدارة حسابك. 🤝`;
}

/**
 * Creates a valid WhatsApp click-to-chat URL.
 */
export function createWhatsAppClickToChat(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}
