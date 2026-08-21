
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables?: any) {
  await sleep(200);
  const res = await fetch(`${API_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) console.warn('GQL Error:', JSON.stringify(json.errors));
  return json;
}

async function main() {
  console.log('--- Setting up All Port Sudan View Columns ---');

  const objRes = await gql('query { objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name } } } } }');
  const portSudanObj = objRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;
  const fieldIdByName = new Map<string, string>(portSudanObj.fieldsList.map((f: any) => [f.name, f.id]));

  const viewId = '8f698116-f12e-4a3b-be47-4df74855970b';

  const columnOrder = [
    'account',
    'listingId',
    'name',
    'hostName',
    'hostPhone',
    'hostWhatsapp',
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
    'zone',
    'googleMapsUrl',
    'listingUrl',
    'bedrooms',
    'bathrooms',
    'beds',
    'guestCapacity',
    'priceNightSdg',
    'propertyType',
    'publishState',
    'overallTrustScore',
  ];

  for (let i = 0; i < columnOrder.length; i++) {
    const col = columnOrder[i];
    const fieldMetadataId = fieldIdByName.get(col);
    if (!fieldMetadataId) continue;

    console.log(`  + Setting column [${i}] ${col}`);
    await gql(`
      mutation CreateViewField($input: CreateViewFieldInput!) {
        createViewField(input: $input) { id }
      }
    `, {
      input: {
        viewId,
        fieldMetadataId,
        position: i,
        isVisible: true,
        size: col.includes('description') || col.includes('space') || col.includes('notes') ? 240 : 160
      }
    });
  }

  // Set sort by listingId ASC
  const listingIdFieldId = fieldIdByName.get('listingId');
  if (listingIdFieldId) {
    console.log('  + Setting sort by listingId ASC');
    await gql(`
      mutation CreateSort($input: CreateViewSortInput!) {
        createViewSort(input: $input) { id }
      }
    `, {
      input: {
        viewId,
        fieldMetadataId: listingIdFieldId,
        direction: 'ASC'
      }
    });
  }

  console.log('--- All Port Sudan View Setup Complete ---');
}

main().catch(console.error);
