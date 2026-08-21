
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

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

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(200);
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
  console.log('=== EXACTLY MIRRORING ALL HOMES COLUMNS & HEADERS IN PORTSUDAN ===');

  const objRes = await gql('query { objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name label type icon } } } } }');
  const portSudanObj = objRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;
  const existingFields = new Map<string, any>(portSudanObj.fieldsList.map((f: any) => [f.name, f]));

  // 1. Add missing fields if not present: photoStage, country, city
  if (!existingFields.has('photoStage')) {
    console.log('  + Creating photoStage field...');
    await gql(`
      mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name }
      }
    `, {
      input: {
        field: {
          objectMetadataId: portSudanObj.id,
          name: 'photoStage',
          label: 'Stage',
          type: 'SELECT',
          icon: 'IconPhotoSearch',
          options: [
            { value: 'NOT_FOUND', label: 'Not Found', position: 0, color: 'gray' },
            { value: 'FOUND_POOR', label: 'Poor', position: 1, color: 'red' },
            { value: 'ACCEPTABLE', label: 'Acceptable', position: 2, color: 'yellow' },
            { value: 'HIGH_RES', label: 'High Res', position: 3, color: 'blue' },
            { value: 'SUPERIOR', label: 'Superior', position: 4, color: 'green' },
          ]
        }
      }
    });
  }

  if (!existingFields.has('country')) {
    console.log('  + Creating country field...');
    await gql(`
      mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name }
      }
    `, {
      input: {
        field: {
          objectMetadataId: portSudanObj.id,
          name: 'country',
          label: 'Country',
          type: 'SELECT',
          icon: 'IconFlag',
          options: [
            { value: 'SUDAN', label: 'Sudan', position: 0, color: 'green' }
          ]
        }
      }
    });
  }

  if (!existingFields.has('city')) {
    console.log('  + Creating city field...');
    await gql(`
      mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name }
      }
    `, {
      input: {
        field: {
          objectMetadataId: portSudanObj.id,
          name: 'city',
          label: 'City',
          type: 'SELECT',
          icon: 'IconBuildingCommunity',
          options: [
            { value: 'PORT_SUDAN', label: 'Portsudan', position: 0, color: 'red' }
          ]
        }
      }
    });
  }

  // 2. Update field headers/labels and icons to match Homes style exactly
  const hostNameField = existingFields.get('hostName');
  if (hostNameField && hostNameField.label !== 'Host') {
    console.log('  = Updating hostName label to "Host" and icon to "IconUserCheck"...');
    await gql(`
      mutation UpdateField($input: UpdateOneFieldMetadataInput!) {
        updateOneField(input: $input) { id label icon }
      }
    `, {
      input: {
        id: hostNameField.id,
        update: {
          label: 'Host',
          icon: 'IconUserCheck'
        }
      }
    });
  }

  const zoneField = existingFields.get('zone');
  if (zoneField) {
    await gql(`
      mutation UpdateField($input: UpdateOneFieldMetadataInput!) {
        updateOneField(input: $input) { id icon }
      }
    `, {
      input: {
        id: zoneField.id,
        update: {
          icon: 'IconMapPin2'
        }
      }
    });
  }

  // 3. Re-fetch field IDs
  const refreshedObjRes = await gql('query { objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name label type icon } } } } }');
  const refreshedPortSudan = refreshedObjRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;
  const fieldIdByName = new Map<string, string>(refreshedPortSudan.fieldsList.map((f: any) => [f.name, f.id]));

  // 4. Exact 28 Columns in Order [0..27]
  const exactColumns = [
    'account',
    'hostName',
    'listingId',
    'name',
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
    'photoStage',
    'propertyType',
    'listingUrl',
    'googleMapsUrl',
    'country',
    'city',
    'zone',
  ];

  const viewId = '8f698116-f12e-4a3b-be47-4df74855970b';
  const viewsRes = await gql('query { getViews { id name viewFields { id isVisible position size fieldMetadataId } } }');
  const currentView = viewsRes.data.getViews.find((v: any) => v.id === viewId);
  const existingViewFieldByFieldId = new Map<string, any>(currentView.viewFields.map((vf: any) => [vf.fieldMetadataId, vf]));
  const exactSet = new Set(exactColumns);

  // Hide any fields not in the 28 columns
  for (const vf of currentView.viewFields) {
    const fn = refreshedPortSudan.fieldsList.find((f: any) => f.id === vf.fieldMetadataId)?.name;
    if (!fn || !exactSet.has(fn)) {
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

  // Set exact positions 0..27
  for (let i = 0; i < exactColumns.length; i++) {
    const col = exactColumns[i];
    const fid = fieldIdByName.get(col);
    if (!fid) {
      console.warn(`Field ${col} not found!`);
      continue;
    }

    const vf = existingViewFieldByFieldId.get(fid);
    const size = col === 'name' ? 440 : 180;

    if (vf) {
      console.log(`  [${i}] Updating column ${col} (pos: ${i})`);
      await gql(`
        mutation UpdateVF($input: UpdateViewFieldInput!) {
          updateViewField(input: $input) { id position isVisible size }
        }
      `, {
        input: {
          id: vf.id,
          update: {
            position: i,
            isVisible: true,
            size,
          }
        }
      });
    } else {
      console.log(`  [${i}] Creating column ${col} (pos: ${i})`);
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
          size,
        }
      });
    }
  }

  // 5. Update data records with country='SUDAN', city='PORT_SUDAN', photoStage='ACCEPTABLE'
  console.log('5. Backfilling country, city, photoStage to all 26 portSudan records...');
  const portSudansRes = await rest('GET', 'portSudans?limit=300&depth=0');
  const records = portSudansRes.data?.portSudans ?? portSudansRes.data ?? [];
  for (const r of records) {
    await rest('PATCH', `portSudans/${r.id}`, {
      country: 'SUDAN',
      city: 'PORT_SUDAN',
      photoStage: 'ACCEPTABLE',
    });
  }

  console.log('✅ Portsudan view EXACTLY mirrors All Homes columns, order, and header style!');
}

main().catch(console.error);
