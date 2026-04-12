// POST /api/strategies/:id/fork — duplicate a public/unlisted strategy as a private copy owned by the caller
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  if (!id || !body?.user_id) {
    throw createError({ statusCode: 400, message: 'Missing fields' })
  }

  const supabase = useServerSupabase()

  // Fetch source strategy + allocations
  const { data: source, error: sourceErr } = await supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (sourceErr || !source) throw createError({ statusCode: 404, message: 'Strategy not found' })

  // Must be public or unlisted to fork
  if (source.visibility === 'private' && source.creator_id !== body.user_id) {
    throw createError({ statusCode: 403, message: 'Strategy is private' })
  }

  // Insert new strategy (private by default). On name collision (user already
  // has a fork with this name), auto-increment the suffix: "(fork)" → "(fork 2)"
  // → "(fork 3)" ... up to 50 attempts.
  const baseName = body.name ?? `${source.name} (fork)`
  let fork: any = null
  let forkErr: any = null
  for (let i = 0; i < 50; i++) {
    const attemptName = i === 0 ? baseName : `${baseName.replace(/ \(fork(?: \d+)?\)$/, '')} (fork ${i + 1})`
    const { data, error } = await supabase
      .from('strategies')
      .insert({
        creator_id: body.user_id,
        name: attemptName,
        description: source.description,
        risk_level: source.risk_level,
        visibility: 'private',
        is_system: false,
        forked_from_id: source.id,
        cover_color: source.cover_color,
        icon: source.icon,
      })
      .select()
      .single()
    if (!error) {
      fork = data
      forkErr = null
      break
    }
    if (error.code === '23505') {
      // Unique violation — try next suffix
      forkErr = error
      continue
    }
    // Any other error — bail out
    forkErr = error
    break
  }

  if (!fork) {
    if (forkErr?.code === '23505') {
      throw createError({ statusCode: 409, message: 'Could not find a unique name for the fork' })
    }
    throw createError({ statusCode: 500, message: forkErr?.message ?? 'Failed to create fork' })
  }

  // Copy allocations
  const allocRows = (source.strategy_allocations ?? []).map((a: any, i: number) => ({
    strategy_id: fork.id,
    vault_address: a.vault_address,
    vault_chain_id: a.vault_chain_id,
    protocol: a.protocol,
    vault_symbol: a.vault_symbol,
    asset_symbol: a.asset_symbol,
    asset_address: a.asset_address,
    weight: a.weight,
    display_order: a.display_order ?? i,
  }))

  const { error: allocErr } = await supabase.from('strategy_allocations').insert(allocRows)
  if (allocErr) {
    await supabase.from('strategies').delete().eq('id', fork.id)
    throw createError({ statusCode: 500, message: allocErr.message })
  }

  // Auto-follow the SOURCE strategy — forking = implicit interest.
  // Insert follower row (ignore duplicates), then re-count and sync cache column.
  const { error: followErr } = await supabase
    .from('strategy_followers')
    .insert({ strategy_id: source.id, user_id: body.user_id })

  if (followErr && !/duplicate/i.test(followErr.message)) {
    console.warn('[fork] follower insert warning:', followErr.code, followErr.message)
  }

  // Re-count from junction table by fetching rows (more reliable than head:true count).
  const { data: followerRows, error: countErr } = await supabase
    .from('strategy_followers')
    .select('user_id')
    .eq('strategy_id', source.id)

  if (countErr) {
    console.warn('[fork] follower count query failed:', countErr.message)
  } else {
    const actualFollowers = followerRows?.length ?? 0
    const { error: updateErr } = await supabase
      .from('strategies')
      .update({ follower_count: actualFollowers })
      .eq('id', source.id)
    if (updateErr) {
      console.warn('[fork] follower_count update failed:', updateErr.message)
    }
  }

  const { data: full } = await supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .eq('id', fork.id)
    .single()

  return full
})
