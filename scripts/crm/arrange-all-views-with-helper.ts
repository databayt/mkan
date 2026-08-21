
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables?: any) {
  await sleep(150);
  const res = await fetch(`${API_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) console.warn('GQL Error:', JSON.stringify(json.errors));
  return json;
}

async function arrangeView(viewId: string, objName: string, columns: string[]) {
  console.log(`\n--- Arranging View ${viewId} (${objName}) with ${columns.length} columns ---`);

  const res = await gql('query { getViews { id name viewFields { id isVisible position size fieldMetadataId } } objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name label } } } } }');
  const targetView = res.data.getViews.find((v: any) => v.id === viewId);
  const targetObj = res.data.objects.edges.find((e: any) => e.node.nameSingular === objName)?.node;

  const fieldIdByName = new Map<string, string>(targetObj.fieldsList.map((f: any) => [f.name, f.id]));
  const existingVfByFid = new Map<string, any>(targetView.viewFields.map((vf: any) => [vf.fieldMetadataId, vf]));
  const colSet = new Set(columns);

  // Hide fields not in column list
  for (const vf of targetView.viewFields) {
    const fn = targetObj.fieldsList.find((f: any) => f.id === vf.fieldMetadataId)?.name;
    if (!fn || !colSet.has(fn)) {
      if (vf.isVisible) {
        await gql(`
          mutation UpdateVF($input: UpdateViewFieldInput!) {
            updateViewField(input: $input) { id }
          }
        `, {
          input: {
            id: vf.id,
            update: { isVisible: false }
          }
        });
      }
    }
  }

  // Update or create viewFields in exact order
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const fid = fieldIdByName.get(col);
    if (!fid) {
      console.warn(`  ! Field ${col} not found on ${objName}`);
      continue;
    }

    const vf = existingVfByFid.get(fid);
    const size = col === 'name' ? 440 : 180;

    if (vf) {
      await gql(`
        mutation UpdateVF($input: UpdateViewFieldInput!) {
          updateViewField(input: $input) { id position isVisible size }
        }
      `, {
        input: {
          id: vf.id,
          update: { position: i, isVisible: true, size }
        }
      });
    } else {
      await gql(`
        mutation CreateVF($input: CreateViewFieldInput!) {
          createViewField(input: $input) { id }
        }
      `, {
        input: {
          viewId,
          fieldMetadataId: fid,
          position: i,
          isVisible: true,
          size
        }
      });
    }
    console.log(`  [${i}] ${col}`);
  }
}

async function main() {
  console.log('=== ARRANGING ALL VIEWS WITH HELPER & HELPER PHONE COLUMNS ===');

  const homesColumns = [
    'account',
    'host',
    'listingId',
    'name',
    'hostPhone',
    'hostWhatsapp',
    'helper',
    'helperPhone',
    'titleEn',
    'titleAr',
    'descriptionEn',
    'descriptionAr',
    'spaceEn',
    'spaceAr',
    'guestAccessEn',
    'guestAccessAr',
    'notesEn',
    'notesAr',
    'airbnbCategoryAr',
    'amenities',
    'highlights',
    'publishState',
    'overallTrustScore',
    'photoStage',
    'propertyType',
    'listingUrl',
    'googleMapsUrl',
    'country',
    'city',
    'zone',
  ];

  const portsudanColumns = [
    'account',
    'hostName',
    'listingId',
    'name',
    'hostPhone',
    'hostWhatsapp',
    'helper',
    'helperPhone',
    'titleEn',
    'titleAr',
    'descriptionEn',
    'descriptionAr',
    'spaceEn',
    'spaceAr',
    'guestAccessEn',
    'guestAccessAr',
    'notesEn',
    'notesAr',
    'airbnbCategoryAr',
    'amenities',
    'highlights',
    'publishState',
    'overallTrustScore',
    'photoStage',
    'propertyType',
    'listingUrl',
    'googleMapsUrl',
    'country',
    'city',
    'zone',
  ];

  // 1. All Homes
  await arrangeView('42608bff-de02-4ad0-b845-a55ea3e8bd37', 'home', homesColumns);

  // 2. Manual Homes (0001–0004)
  await arrangeView('8c49bfce-5ee2-42e6-b4d2-f5d9c83a1666', 'home', homesColumns);

  // 3. All Portsudan
  await arrangeView('8f698116-f12e-4a3b-be47-4df74855970b', 'portSudan', portsudanColumns);

  console.log('\n✅ Successfully arranged all 3 views with Helper & Helper Phone!');
}

main().catch(console.error);
