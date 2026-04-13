export default defineEventHandler(async (event) => {
  const { user_id } = getQuery(event) as { user_id: string }
  if (!user_id) throw createError({ statusCode: 400, message: 'Missing user_id' })

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('pockets')
    .select('*, allocations:pocket_allocations(*)')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, message: error.message })

  // Ensure allocations are sorted by display_order (Supabase nested select
  // doesn't guarantee order without an explicit order clause).
  for (const row of (data ?? []) as any[]) {
    if (Array.isArray(row.allocations)) {
      row.allocations.sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    }
  }

  return data ?? []
})
