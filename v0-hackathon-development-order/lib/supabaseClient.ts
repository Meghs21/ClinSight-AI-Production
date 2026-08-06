import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vfwotpdkxzullsdbrfpn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
