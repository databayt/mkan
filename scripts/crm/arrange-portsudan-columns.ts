
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

async function main() {
  console.log('=== ARRANGING PORT SUDAN COLUMNS TO MATCH MKAN EXACT HOMES PATTERN ===');

  const viewId = '8f698116-f12e-4a3b-be47-4df74855970b';

  // 1. Fetch current viewFields for Port Sudan
  const viewsRes = await gql('query { getViews { id name viewFields { id isVisible position size fieldMetadataId } } objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name label } } } } }');
  const portSudanView = viewsRes.data.getViews.find((v: any) => v.id === viewId);
  const portSudanObj = viewsRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;

  const fieldIdToName = new Map<string, string>(portSudanObj.fieldsList.map((f: any) => [f.id, f.name]));
  const nameToFieldId = new Map<string, string>(portSudanObj.fieldsList.map((f: any) => [f.name, f.id]));
  const viewFieldByFieldId = new Map<string, any>(portSudanView.viewFields.map((vf: any) => [vf.fieldMetadataId, vf]));

  // Exact ordered list of visible columns starting with account:
  const targetColumns = [
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
    'amenities',
    'highlights',
    'publishState',
    'overallTrustScore',
    'propertyType',
    'listingUrl',
    'googleMapsUrl',
    'zone',
    'bedrooms',
    'bathrooms',
    'beds',
    'guestCapacity',
    'priceNightSdg',
  ];

  const targetSet = new Set(targetColumns);

  // 2. Hide all non-target fields
  for (const vf of portSudanView.viewFields) {
    const fname = fieldIdToName.get(vf.fieldMetadataId);
    if (!fname || !targetSet.has(fname)) {
      if (vf.isVisible) {
        console.log(`  - Hiding column ${fname ?? vf.fieldMetadataId}`);
        await gql(`
          mutation UpdateViewField($input: UpdateViewFieldInput!) {
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

  // 3. Set exact position, visibility, and size for target columns
  for (let pos = 0; pos < targetColumns.length; pos++) {
    const col = targetColumns[pos];
    const fieldId = nameToFieldId.get(col);
    if (!fieldId) {
      console.warn(`Field ${col} not found on portSudan object`);
      continue;
    }

    const vf = viewFieldByFieldId.get(fieldId);
    const width =
      col.includes('description') || col.includes('space') || col.includes('notes')
        ? 280
        : col.includes('title')
        ? 260
        : col === 'name' || col === 'listingUrl' || col === 'googleMapsUrl'
        ? 200
        : col === 'account' || col === 'listingId'
        ? 130
        : 160;

    if (vf) {
      console.log(`  [${pos}] Updating ${col} (pos: ${pos}, width: ${width})`);
      await gql(`
        mutation UpdateViewField($input: UpdateViewFieldInput!) {
          updateViewField(input: $input) { id position isVisible size }
        }
      `, {
        input: {
          id: vf.id,
          update: {
            position: pos,
            isVisible: true,
            size: width,
          }
        }
      });
    } else {
      console.log(`  [${pos}] Creating viewField for ${col} (pos: ${pos}, width: ${width})`);
      await gql(`
        mutation CreateViewField($input: CreateViewFieldInput!) {
          createViewField(input: $input) { id }
        }
      `, {
        input: {
          viewId,
          fieldMetadataId: fieldId,
          position: pos,
          isVisible: true,
          size: width,
        }
      });
    }
  }

  // 4. Ensure Sort is listingId ASC
  const listingIdFieldId = nameToFieldId.get('listingId');
  if (listingIdFieldId) {
    console.log('  -> Setting sort: listingId ASC');
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

  console.log('✅ Port Sudan View Columns Arranged Successfully!');
}

main().catch(console.error);
