import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useServerSupabase(): SupabaseClient {
  if (client) return client

  const { supabaseUrl, supabaseKey } = useRuntimeConfig()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or key in runtimeConfig')
  }

  client = createClient(supabaseUrl, supabaseKey)
  return client
}
