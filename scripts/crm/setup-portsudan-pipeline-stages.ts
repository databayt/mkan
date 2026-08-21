
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

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
  await sleep(120);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const PIPELINE_STAGE_OPTIONS = [
  { value: 'HUNTED', label: '🎯 صيد جديد (Hunted)', color: 'blue', position: 0 },
  { value: 'VETTING', label: '🔍 قيد المعاينة (Vetting)', color: 'yellow', position: 1 },
  { value: 'CONTACT_READY', label: '📱 جاهز للتواصل (Contact Ready)', color: 'purple', position: 2 },
  { value: 'OUTREACH_SENT', label: '✉️ تم إرسال العرض (Outreach Sent)', color: 'orange', position: 3 },
  { value: 'CLAIMED', label: '🤝 تم الاستلام والتأكيد (Claimed)', color: 'teal', position: 4 },
  { value: 'LIVE', label: '🟢 متاح للحجز (Live on mkan)', color: 'green', position: 5 },
  { value: 'SYNCED', label: '🔄 متابعة ومزامنة (Synced Loop)', color: 'emerald', position: 6 },
  { value: 'DORMANT', label: '⏸️ مجمّد مؤقتاً (Dormant)', color: 'gray', position: 7 },
  { value: 'REJECTED', label: '❌ غير مطابق (Rejected)', color: 'red', position: 8 },
];

async function main() {
  console.log('=== SETTING UP LOCALIZED PORT SUDAN PIPELINE STAGES IN TWENTY CRM ===\n');

  // 1. Fetch metadata
  const meta = await gql(`
    query {
      objects(paging: { first: 50 }) {
        edges {
          node {
            id
            nameSingular
            fieldsList { id name label type options }
          }
        }
      }
    }
  `);

  const objects = meta.objects.edges.map((e: any) => e.node);
  const psObj = objects.find((o: any) => o.nameSingular === 'portSudan');
  const homeObj = objects.find((o: any) => o.nameSingular === 'home');

  for (const obj of [psObj, homeObj]) {
    if (!obj) continue;
    const existingField = obj.fieldsList.find((f: any) => f.name === 'pipelineStage');

    if (!existingField) {
      console.log(`+ Creating pipelineStage on ${obj.nameSingular}...`);
      await gql(`
        mutation CreatePipelineStage($input: CreateOneFieldMetadataInput!) {
          createOneField(input: $input) { id name label }
        }
      `, {
        input: {
          field: {
            objectMetadataId: obj.id,
            name: 'pipelineStage',
            label: 'Pipeline Stage',
            type: 'SELECT',
            icon: 'IconTimelineEvent',
            options: PIPELINE_STAGE_OPTIONS,
            defaultValue: "'HUNTED'",
          }
        }
      });
      console.log(`  ✓ Created pipelineStage field on ${obj.nameSingular}`);
    } else {
      console.log(`  = Updating options for pipelineStage on ${obj.nameSingular}...`);
      await gql(`
        mutation UpdatePipelineStage($input: UpdateOneFieldMetadataInput!) {
          updateOneField(input: $input) { id name label }
        }
      `, {
        input: {
          id: existingField.id,
          update: {
            options: PIPELINE_STAGE_OPTIONS,
          }
        }
      });
      console.log(`  ✓ Updated pipelineStage options on ${obj.nameSingular}`);
    }
  }

  // 2. Populate pipelineStage across all 34 Port Sudan listings
  const psRes = await rest('GET', 'portSudans?limit=100&depth=0');
  const psList = psRes.data?.portSudans ?? psRes.data ?? [];

  console.log(`\nPopulating pipelineStage for ${psList.length} Port Sudan listings...`);

  for (const p of psList) {
    let stage = 'HUNTED';

    if (['0001', '0002', '0003', '0004'].includes(p.account)) {
      stage = 'SYNCED'; // Verified live partner homes
    } else if (['1004', '1006'].includes(p.account)) {
      stage = 'CONTACT_READY'; // Mobile phone verified, ready for WhatsApp first touch!
    } else if (p.account && p.account.startsWith('10')) {
      stage = 'HUNTED'; // Scraped Airbnb properties ready for phone scouting
    }

    await rest('PATCH', `portSudans/${p.id}`, { pipelineStage: stage });
    console.log(`  [${p.listingId}] Account ${p.account} -> Stage: ${stage} (${p.name?.slice(0, 30)})`);
  }

  // Sync to homes table as well
  const homeRes = await rest('GET', 'homes?limit=300&depth=0');
  const homeList = homeRes.data?.homes ?? homeRes.data ?? [];

  for (const p of psList) {
    const matchedHome = homeList.find((h: any) => h.listingId === p.listingId);
    if (matchedHome) {
      let stage = 'HUNTED';
      if (['0001', '0002', '0003', '0004'].includes(p.account)) stage = 'SYNCED';
      else if (['1004', '1006'].includes(p.account)) stage = 'CONTACT_READY';
      else stage = 'HUNTED';

      await rest('PATCH', `homes/${matchedHome.id}`, { pipelineStage: stage });
    }
  }

  console.log('\n✅ Port Sudan localized pipeline stages successfully configured in Twenty CRM!');
}

main().catch(console.error);
