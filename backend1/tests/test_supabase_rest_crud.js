const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseRest() {
  console.log('====================================================');
  console.log('⚡ TESTING SUPABASE REST API TABLE ACCESS (HTTPS 443)');
  console.log('====================================================\n');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vfwotpdkxzullsdbrfpn.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-';

  const supabase = createClient(url, key);

  console.log('📡 Querying table "patients" over Supabase REST API...');
  const { data: patients, error: pErr } = await supabase.from('patients').select('*');
  
  if (pErr) {
    console.log('⚠️ Patients table status:', pErr.message);
  } else {
    console.log(`✅ Patients Table Connected over REST! Rows returned: ${patients.length}`);
    console.log(patients);
  }

  console.log('\n📡 Querying table "medications" over Supabase REST API...');
  const { data: meds, error: mErr } = await supabase.from('medications').select('*');
  
  if (mErr) {
    console.log('⚠️ Medications table status:', mErr.message);
  } else {
    console.log(`✅ Medications Table Connected over REST! Rows returned: ${meds.length}`);
    console.log(meds);
  }
}

testSupabaseRest();
