const { Client } = require('pg');

const hosts = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
];

const pass = '8ty%40KCjbrVVPZ8n';
const projectRef = 'vfwotpdkxzullsdbrfpn';

async function testHosts() {
  for (const host of hosts) {
    const connStr = `postgresql://postgres.${projectRef}:${pass}@${host}:6543/postgres`;
    console.log(`🔌 Testing host: ${host}...`);
    const client = new Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`🎉 SUCCESS! Connected to Supabase via host: ${host}`);
      const res = await client.query('SELECT NOW() as current_time, version();');
      console.log('📅 Time:', res.rows[0].current_time);
      await client.end();
      return connStr;
    } catch (err) {
      console.log(`❌ Failed on ${host}:`, err.message);
    }
  }
}

testHosts();
