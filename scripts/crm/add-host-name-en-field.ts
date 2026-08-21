
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;
const GRAPHQL = `${API_URL}/metadata`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(150);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const HOST_NAMES: Record<string, { ar: string; en: string }> = {
  '0001': { ar: 'عبدوت', en: 'Abdout' },
  '0002': { ar: 'دقنة', en: 'Digna' },
  '0003': { ar: 'حسين', en: 'Hussein' },
  '0004': { ar: 'السند', en: 'Al-Sanad' },
  '1001': { ar: 'طاهر', en: 'Tahir' },
  '1002': { ar: 'هاشم', en: 'Hashim' },
  '1003': { ar: 'معتز', en: 'Moe Gi' },
  '1004': { ar: 'محمد', en: 'Muhamed' },
  '1005': { ar: 'إيمان', en: 'Iman' },
  '1006': { ar: 'متوكل', en: 'Mutwakil' },
  '1007': { ar: 'محمد', en: 'Mohmmed' },
  '1008': { ar: 'عثمان', en: 'Osman' },
};

async function main() {
  console.log('=== ADDING hostNameEn FIELD & BILINGUAL HOST NAMES ===\n');

  // 1. Fetch metadata objects
  const meta = await gql(`
    query {
      objects(paging: { first: 50 }) {
        edges {
          node {
            id
            nameSingular
            labelSingular
            fieldsList { id name label type }
          }
        }
      }
    }
  `);

  const objects = meta.objects.edges.map((e: any) => e.node);
  const psObj = objects.find((o: any) => o.nameSingular === 'portSudan');
  const homeObj = objects.find((o: any) => o.nameSingular === 'home');

  // 2. Add hostNameEn to portSudan and home if not exists
  for (const obj of [psObj, homeObj]) {
    if (!obj) continue;
    const hasHostNameEn = obj.fieldsList.some((f: any) => f.name === 'hostNameEn');
    if (!hasHostNameEn) {
      console.log(`+ Adding hostNameEn to ${obj.nameSingular}...`);
      await gql(`
        mutation CreateHostNameEn($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name label }
        }
      `, {
        input: {
          field: {
            objectMetadataId: obj.id,
            name: 'hostNameEn',
            label: 'Host (EN)',
            type: 'TEXT',
            icon: 'IconUser',
          }
        }
      });
      console.log(`  ✓ Field hostNameEn created on ${obj.nameSingular}`);
    } else {
      console.log(`  = Field hostNameEn already exists on ${obj.nameSingular}`);
    }
  }

  // 3. Update all 34 Port Sudan listings in Twenty CRM with bilingual host names
  const psRes = await rest('GET', 'portSudans?limit=100&depth=0');
  const psList = psRes.data?.portSudans ?? psRes.data ?? [];

  console.log(`\nUpdating ${psList.length} Port Sudan listings with bilingual host names...`);

  for (const p of psList) {
    const acc = p.account;
    const names = HOST_NAMES[acc];
    if (names) {
      await rest('PATCH', `portSudans/${p.id}`, {
        hostName: names.ar,
        hostNameEn: names.en,
      });
      console.log(`  [UPDATED] ${p.listingId} (Account ${acc}) -> Host (AR): ${names.ar} | Host (EN): ${names.en}`);
    }
  }

  // 4. Set hostNameEn to invisible (isVisible: false) in views
  const viewsRes = await gql(`
    query {
      getViews {
        id
        name
        objectMetadataId
        viewFields {
          id
          fieldMetadataId
          isVisible
        }
      }
    }
  `);

  // Refetch portSudan metadata to get hostNameEn field ID
  const refreshedMeta = await gql(`
    query {
      objects(paging: { first: 50 }) {
        edges {
          node {
            id
            nameSingular
            fieldsList { id name }
          }
        }
      }
    }
  `);
  const refreshedPsObj = refreshedMeta.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;
  const hostNameEnField = refreshedPsObj?.fieldsList.find((f: any) => f.name === 'hostNameEn');

  if (hostNameEnField) {
    const psViews = viewsRes.getViews.filter((v: any) => v.objectMetadataId === refreshedPsObj.id);
    for (const v of psViews) {
      const vf = v.viewFields.find((f: any) => f.fieldMetadataId === hostNameEnField.id);
      if (vf && vf.isVisible) {
        await gql(`
          mutation HideField($id: UUID!) {
            updateOneViewField(input: {
              id: $id,
              update: { isVisible: false }
            }) { id isVisible }
          }
        `, { id: vf.id });
        console.log(`  ✓ Hidden hostNameEn in view ${v.name}`);
      }
    }
  }

  // 5. Update host users in MKAN Postgres DB
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  for (const [acc, names] of Object.entries(HOST_NAMES)) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: `${acc}@mkan.org` },
          { username: acc }
        ]
      }
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          username: names.ar,
        }
      });
      console.log(`  ✓ MKAN DB User updated: ${acc}@mkan.org -> ${names.ar} (${names.en})`);
    }
  }

  console.log('\n✅ All bilingual host names and invisible Host (EN) column configured successfully!');
}

main().catch(console.error);
