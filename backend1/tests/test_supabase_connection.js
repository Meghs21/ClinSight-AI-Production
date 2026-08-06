const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
  console.log('====================================================');
  console.log('⚡ TESTING LIVE SUPABASE CONNECTION');
  console.log('====================================================\n');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log(`🌐 Supabase URL: ${url}`);
  console.log(`🔑 Publishable Key: ${key ? `${key.slice(0, 15)}...` : 'MISSING'}\n`);

  if (!url || !key) {
    console.error('❌ Supabase URL or Key missing in environment.');
    return;
  }

  try {
    const supabase = createClient(url, key);
    console.log('📡 Sending ping request to Supabase Auth & REST Endpoints...');

    const start = Date.now();
    const { data, error } = await supabase.auth.getSession();
    const duration = Date.now() - start;

    if (error) {
      console.warn(`⚠️ Auth endpoint response (${duration}ms):`, error.message);
    } else {
      console.log(`✅ Auth Endpoint Connected Successfully! (${duration}ms response time)`);
    }

    // Ping REST Endpoint API
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    console.log(`✅ Supabase REST API Ping Status: ${res.status} ${res.statusText}`);
    console.log('\n====================================================');
    console.log('🎉 LIVE SUPABASE CONNECTION TEST COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Supabase Connection Test Failed:', err.message);
  }
}

testSupabase();
