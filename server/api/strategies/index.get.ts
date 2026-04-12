// GET /api/strategies — list strategies visible to the caller.
// Filters: visibility=public|unlisted|private, creator_id, risk_level
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const visibility = (query.visibility as string | undefined) ?? 'public'
  const creator_id = query.creator_id as string | undefined
  const risk_level = query.risk_level as string | undefined
  const limit = Math.min(Number(query.limit ?? 50), 100)

  const supabase = useServerSupabase()
  let q = supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .is('deleted_at', null)
    .order('follower_count', { ascending: false })
    .limit(limit)

  if (creator_id) {
    q = q.eq('creator_id', creator_id)
  } else {
    // Public listing — only show public strategies unless explicitly querying own
    q = q.eq('visibility', visibility)
  }
  if (risk_level) q = q.eq('risk_level', risk_level)

  const { data, error } = await q
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data ?? []
})
