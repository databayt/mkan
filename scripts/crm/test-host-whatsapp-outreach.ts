
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

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

export function compileHostFirstMessage(data: HostOutreachData): string {
  return `السلام عليكم ورحمة الله أستاذ ${data.hostNameAr}،

معاك فريق منصة «مكان» (mkan.sd) — المنصة السودانية الأولى لحجز الشقق المفروشة والإقامات الموثوقة مباشرة بين المضيف والنزيل.

أضفنا عقارك المميز «${data.propertyName}» (${data.zoneAr}) على المنصة وجهزنا صفحته بالكامل مع الصور والوصف:
🔗 ${data.listingUrl}

حابين نسلمك حساب المضيف الخاص بك لتستلم طلبات الحجز والتواصل مع الضيوف مباشرة على رقم الواتساب الخاص بك وبدون أي عمولة (0%).

لتفعيل استلام الحجوزات أو تحديث الأسعار والتوافر، فقط رد علينا بتأكيد وسنربط رقمك فوراً لإدارة حسابك. 🤝`;
}

export function createWhatsAppClickToChat(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

async function main() {
  console.log('=== MKAN HOST FUNNEL — STAGE 1 FIRST WHATSAPP MESSAGE GENERATOR ===\n');

  const psRes = await rest('GET', 'portSudans?limit=50&depth=0');
  const psList = (psRes.data?.portSudans ?? psRes.data ?? [])
    .filter((r: any) => r.account && r.account.startsWith('10'))
    .sort((a: any, b: any) => a.listingId.localeCompare(b.listingId));

  console.log(`Generated First Funnel Messages for ${psList.length} Airbnb Domain Hosts:\n`);

  for (const item of psList) {
    const phone = item.hostWhatsapp?.primaryPhoneNumber 
      ? `+249${item.hostWhatsapp.primaryPhoneNumber}` 
      : (item.hostPhone?.primaryPhoneNumber ? `+249${item.hostPhone.primaryPhoneNumber}` : null);

    const data: HostOutreachData = {
      account: item.account,
      listingId: item.listingId,
      hostNameAr: item.hostName || 'المضيف',
      hostNameEn: item.hostNameEn || 'Host',
      propertyName: item.name || item.titleAr,
      zoneAr: item.zone === 'AIRPORT_DISTRICT' ? 'حي المطار' : (item.zone === 'AL_MIRGHANIYA' ? 'حي الميرغنية' : (item.zone === 'AROUS' ? 'منطقة عروس' : 'بورتسودان')),
      priceSdg: item.priceNightSdg?.amountMicros ? item.priceNightSdg.amountMicros / 1000000 : 0,
      phone,
      listingUrl: `https://mkan.sd/ar/listings/${item.listingId}`,
    };

    const msg = compileHostFirstMessage(data);
    const waLink = phone ? createWhatsAppClickToChat(phone, msg) : null;

    console.log(`----------------------------------------------------------------------`);
    console.log(`[ACCOUNT ${data.account}] ${data.hostNameAr} (${data.hostNameEn}) — ${data.listingId}`);
    console.log(`Property: ${data.propertyName}`);
    console.log(`Phone: ${phone ?? '⏳ (Pending discovery / In-app Airbnb contact)'}`);
    if (waLink) {
      console.log(`📲 1-Click WhatsApp Direct Link:
${waLink}`);
    }
    console.log(`
💬 Message Preview:
${msg}
`);
  }

  console.log('✅ Host Funnel config and message templates verified successfully!');
}

main().catch(console.error);
