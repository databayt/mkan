
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const phones = (num: string) => ({
  primaryPhoneNumber: num.replace(/^\+?249/, ''),
  primaryPhoneCountryCode: 'SD',
  primaryPhoneCallingCode: '+249',
  additionalPhones: []
});

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(250);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

async function main() {
  console.log('=== UPDATING ACCOUNT 0001 PHONE NUMBER TO +249915494649 ===');

  const phoneSD = '+249915494649';
  const phoneObj = phones(phoneSD);

  // 1. Update in Prisma DB
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const updatedUser = await prisma.user.updateMany({
    where: { email: '0001' },
    data: { phoneNumber: phoneSD }
  });
  console.log(`1. Prisma DB: Updated ${updatedUser.count} user (0001@mkan.org) phoneNumber to ${phoneSD}`);

  // 2. Update Host in Twenty CRM
  const hostsRes = await rest('GET', 'hosts?limit=200&depth=0');
  const hosts = hostsRes.data?.hosts ?? hostsRes.data ?? [];
  const host0001 = hosts.find((h: any) => h.mkanUsername === '0001' || h.name === 'عبدوت');
  if (host0001) {
    console.log(`2. Twenty CRM Host: Updating Host 0001 (${host0001.id})...`);
    await rest('PATCH', `hosts/${host0001.id}`, {
      phone: phoneObj,
      whatsapp: phoneObj,
    });
  }

  // 3. Update Homes in Twenty CRM (account === '0001')
  const homesRes = await rest('GET', 'homes?limit=300&depth=0');
  const homes = homesRes.data?.homes ?? homesRes.data ?? [];
  const homes0001 = homes.filter((h: any) => h.account === '0001');
  console.log(`3. Twenty CRM Homes: Updating ${homes0001.length} homes for account 0001...`);
  for (const h of homes0001) {
    const updatedNotesAr = h.notesAr
      ? (h.notesAr.includes('0915494649') ? h.notesAr : `${h.notesAr}\n• للحجز المباشر اتصل بالمالك: 0915494649.`)
      : '• للحجز المباشر اتصل بالمالك: 0915494649.';
    const updatedNotesEn = h.notesEn
      ? (h.notesEn.includes('0915494649') || h.notesEn.includes('+249915494649') ? h.notesEn : `${h.notesEn}\n• Direct booking contact: +249915494649.`)
      : '• Direct booking contact: +249915494649.';

    const fullDescAr = `${h.titleAr ?? h.name}\n\nالمسكن:\n${h.spaceAr ?? ''}\n\nوصول الضيوف:\n${h.guestAccessAr ?? ''}\n\nملاحظات أخرى:\n${updatedNotesAr}`;
    const fullDescEn = `${h.titleEn ?? h.name}\n\nThe space:\n${h.spaceEn ?? ''}\n\nGuest access:\n${h.guestAccessEn ?? ''}\n\nOther things to note:\n${updatedNotesEn}`;

    await rest('PATCH', `homes/${h.id}`, {
      hostPhone: phoneObj,
      hostWhatsapp: phoneObj,
      notesAr: updatedNotesAr,
      notesEn: updatedNotesEn,
      descriptionAr: fullDescAr,
      descriptionEn: fullDescEn,
      description: fullDescAr,
    });
    console.log(`   -> Updated home ${h.listingId}`);
  }

  // 4. Update portSudans in Twenty CRM (account === '0001')
  const portSudansRes = await rest('GET', 'portSudans?limit=300&depth=0');
  const portSudans = portSudansRes.data?.portSudans ?? portSudansRes.data ?? [];
  const portSudans0001 = portSudans.filter((p: any) => p.account === '0001');
  console.log(`4. Twenty CRM Portsudan: Updating ${portSudans0001.length} records for account 0001...`);
  for (const p of portSudans0001) {
    const updatedNotesAr = p.notesAr
      ? (p.notesAr.includes('0915494649') ? p.notesAr : `${p.notesAr}\n• للحجز المباشر اتصل بالمالك: 0915494649.`)
      : '• للحجز المباشر اتصل بالمالك: 0915494649.';
    const updatedNotesEn = p.notesEn
      ? (p.notesEn.includes('0915494649') || p.notesEn.includes('+249915494649') ? p.notesEn : `${p.notesEn}\n• Direct booking contact: +249915494649.`)
      : '• Direct booking contact: +249915494649.';

    const fullDescAr = `${p.titleAr ?? p.name}\n\nالمسكن:\n${p.spaceAr ?? ''}\n\nوصول الضيوف:\n${p.guestAccessAr ?? ''}\n\nملاحظات أخرى:\n${updatedNotesAr}`;
    const fullDescEn = `${p.titleEn ?? p.name}\n\nThe space:\n${p.spaceEn ?? ''}\n\nGuest access:\n${p.guestAccessEn ?? ''}\n\nOther things to note:\n${updatedNotesEn}`;

    await rest('PATCH', `portSudans/${p.id}`, {
      hostPhone: phoneObj,
      hostWhatsapp: phoneObj,
      notesAr: updatedNotesAr,
      notesEn: updatedNotesEn,
      descriptionAr: fullDescAr,
      descriptionEn: fullDescEn,
    });
    console.log(`   -> Updated portSudan ${p.listingId}`);
  }

  console.log('✅ Successfully updated phone number across Prisma, Hosts, Homes, and Portsudan objects!');
}

main().catch(console.error);
