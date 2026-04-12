// POST /api/strategies/:id/follow — toggle follow (insert if not exists, delete if exists)
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  if (!id || !body?.user_id) {
    throw createError({ statusCode: 400, message: 'Missing fields' })
  }

  const supabase = useServerSupabase()

  // Check if already following
  const { data: existing } = await supabase
    .from('strategy_followers')
    .select('strategy_id')
    .eq('strategy_id', id)
    .eq('user_id', body.user_id)
    .maybeSingle()

  let following: boolean
  if (existing) {
    // Unfollow
    const { error: delErr } = await supabase
      .from('strategy_followers')
      .delete()
      .eq('strategy_id', id)
      .eq('user_id', body.user_id)
    if (delErr) throw createError({ statusCode: 500, message: delErr.message })
    following = false
  } else {
    // Follow
    const { error: insertErr } = await supabase
      .from('strategy_followers')
      .insert({ strategy_id: id, user_id: body.user_id })
    if (insertErr) throw createError({ statusCode: 500, message: insertErr.message })
    following = true
  }

  // Re-count from junction table by fetching rows (more reliable than head:true count).
  const { data: followerRows } = await supabase
    .from('strategy_followers')
    .select('user_id')
    .eq('strategy_id', id)

  const count = followerRows?.length ?? 0
  await supabase
    .from('strategies')
    .update({ follower_count: count })
    .eq('id', id)

  return { following, followerCount: count }
})
