
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
  console.log('=== RENAMING TO PORTSUDAN (NO SPACE) IN OBJECTS, VIEWS, FILTERS & OPTIONS ===');

  // 1. Rename Object portSudan labels
  const portSudanObjId = '5ad63e19-f89f-4759-946e-6ce8caf56043';
  console.log('1. Updating portSudan object labels to "Portsudan"...');
  const resObj = await gql(`
    mutation UpdateObject($input: UpdateOneObjectInput!) {
      updateOneObject(input: $input) {
        id
        labelSingular
        labelPlural
      }
    }
  `, {
    input: {
      id: portSudanObjId,
      update: {
        labelSingular: 'Portsudan',
        labelPlural: 'Portsudan',
      }
    }
  });
  console.log('  -> Object updated:', resObj.data?.updateOneObject);

  // 2. Rename Views
  console.log('2. Updating view names...');
  const viewRenames = [
    { id: '8f698116-f12e-4a3b-be47-4df74855970b', name: 'All Portsudan' },
    { id: '510685b5-4511-42d0-898b-a2ee19bda8c8', name: 'Portsudan' },
    { id: 'c3cd8636-435c-42d7-b10b-3ce5e85c587e', name: 'Portsudan Record Page Fields' },
  ];

  for (const v of viewRenames) {
    const resView = await gql(`
      mutation UpdateView($id: String!, $input: UpdateViewInput!) {
        updateView(id: $id, input: $input) {
          id
          name
        }
      }
    `, {
      id: v.id,
      input: { name: v.name }
    });
    console.log(`  -> View ${v.id} renamed to "${v.name}":`, resView.data?.updateView?.name);
  }

  // 3. Update Home.city options to change "Port Sudan" -> "Portsudan"
  console.log('3. Updating Home.city option label for PORT_SUDAN...');
  const objectsRes = await gql('query { objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name label type options } } } } }');
  const homeObj = objectsRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'home')?.node;
  const cityField = homeObj?.fieldsList.find((f: any) => f.name === 'city');

  if (cityField && Array.isArray(cityField.options)) {
    const updatedOptions = cityField.options.map((opt: any) => {
      if (opt.value === 'PORT_SUDAN') {
        return { ...opt, label: 'Portsudan' };
      }
      return opt;
    });

    const resField = await gql(`
      mutation UpdateField($input: UpdateOneFieldMetadataInput!) {
        updateOneField(input: $input) {
          id
          name
          options
        }
      }
    `, {
      input: {
        id: cityField.id,
        update: {
          options: updatedOptions
        }
      }
    });
    console.log('  -> Home.city options updated. PORT_SUDAN is now:', resField.data?.updateOneField?.options?.find((o: any) => o.value === 'PORT_SUDAN'));
  }

  // 4. Update Navigation Menu Item name to Portsudan
  console.log('4. Updating Navigation menu item name...');
  const navRes = await gql('query { navigationMenuItems { id name type position targetObjectMetadataId } }');
  const portSudanNavItem = navRes.data.navigationMenuItems.find((n: any) => n.targetObjectMetadataId === portSudanObjId);
  if (portSudanNavItem) {
    await gql(`
      mutation UpdateNav($input: UpdateOneNavigationMenuItemInput!) {
        updateNavigationMenuItem(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        id: portSudanNavItem.id,
        update: {
          name: 'Portsudan'
        }
      }
    });
    console.log('  -> Navigation item name updated to Portsudan');
  }

  console.log('✅ ALL RENAMED TO PORTSUDAN (NO SPACE)!');
}

main().catch(console.error);
