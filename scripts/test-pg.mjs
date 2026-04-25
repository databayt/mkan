import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_L1UT9sSDzZeB@ep-floral-dawn-a49s9usv-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});
console.log('Connecting...');
try {
  await client.connect();
  console.log('CONNECTED');
  const r = await client.query('SELECT 1 as ping, now() as now');
  console.log('Result:', r.rows);
  await client.end();
} catch (e) {
  console.error('FAILED:', e.message);
}
