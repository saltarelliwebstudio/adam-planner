import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Fail loud in the browser if env vars didn't get baked into the build —
// silently writing to a placeholder URL is exactly how tasks "vanish."
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseKey)) {
  // eslint-disable-next-line no-console
  console.error('[planner] NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing — sync will not work')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder',
  {
    realtime: { params: { eventsPerSecond: 10 } },
  },
)
