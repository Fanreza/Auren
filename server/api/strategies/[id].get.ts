// GET /api/strategies/:id — fetch a single strategy with its allocations.
// Also self-heals `follower_count` cache column by re-counting from the junction
// table, so strategies forked before the count-sync fix still reconcile.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing id' })

  const supabase = useServerSupabase()
  const { data, error } = await supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!data) throw createError({ statusCode: 404, message: 'Strategy not found' })

  // Self-heal: reconcile cached follower_count from actual junction rows.
  // Cheap — one indexed query. Skips the update if already in sync.
  try {
    const { data: followerRows } = await supabase
      .from('strategy_followers')
      .select('user_id')
      .eq('strategy_id', id)
    const actual = followerRows?.length ?? 0
    if (actual !== (data.follower_count ?? 0)) {
      await supabase
        .from('strategies')
        .update({ follower_count: actual })
        .eq('id', id)
      data.follower_count = actual
    }
  } catch {
    // Non-fatal — return stale count rather than failing the request
  }

  return data
})
