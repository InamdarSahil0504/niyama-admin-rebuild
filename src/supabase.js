import { createClient } from '@supabase/supabase-js'

// SECURITY WARNING: This admin panel uses the Supabase SERVICE ROLE key to bypass Row Level Security.
// The service role key has full database access. This app must NEVER be deployed publicly —
// it is password-gated and for internal admin use only on admin.niyamalife.com.
// Never commit the .env file or expose this key in any public repo or CDN.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[Niyama Admin] Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_KEY. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
})
