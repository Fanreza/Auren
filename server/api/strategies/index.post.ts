// POST /api/strategies — create a new strategy with allocations.
// Allocations must sum to 1.0 (validated server-side).
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.creator_id || !body?.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }
  if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one allocation required' })
  }

  // Validate weights sum to 1.0 (allow small floating point drift)
  const totalWeight = body.allocations.reduce((s: number, a: any) => s + (Number(a.weight) || 0), 0)
  if (Math.abs(totalWeight - 1) > 0.001) {
    throw createError({
      statusCode: 400,
      message: `Allocation weights must sum to 100% (got ${(totalWeight * 100).toFixed(2)}%)`,
    })
  }

  // Reject duplicate vault addresses within the same strategy
  const seen = new Set<string>()
  for (const alloc of body.allocations) {
    const key = String(alloc.vault_address).toLowerCase()
    if (seen.has(key)) {
      throw createError({ statusCode: 400, message: 'Duplicate vault in allocations' })
    }
    seen.add(key)
  }

  const supabase = useServerSupabase()

  // Insert strategy
  const { data: strategy, error: strategyErr } = await supabase
    .from('strategies')
    .insert({
      creator_id: body.creator_id,
      name: body.name,
      description: body.description ?? null,
      risk_level: body.risk_level ?? null,
      visibility: body.visibility ?? 'private',
      is_system: false,
      forked_from_id: body.forked_from_id ?? null,
      cover_color: body.cover_color ?? null,
      icon: body.icon ?? null,
    })
    .select()
    .single()

  if (strategyErr) {
    if (strategyErr.code === '23505') {
      throw createError({ statusCode: 409, message: 'You already have a strategy with this name' })
    }
    throw createError({ statusCode: 500, message: strategyErr.message })
  }

  // Insert allocations in bulk
  const allocRows = body.allocations.map((a: any, i: number) => ({
    strategy_id: strategy.id,
    vault_address: a.vault_address,
    vault_chain_id: a.vault_chain_id,
    protocol: a.protocol ?? null,
    vault_symbol: a.vault_symbol ?? null,
    asset_symbol: a.asset_symbol ?? null,
    asset_address: a.asset_address ?? null,
    weight: a.weight,
    display_order: a.display_order ?? i,
  }))

  const { error: allocErr } = await supabase
    .from('strategy_allocations')
    .insert(allocRows)

  if (allocErr) {
    // Roll back strategy insert
    await supabase.from('strategies').delete().eq('id', strategy.id)
    throw createError({ statusCode: 500, message: allocErr.message })
  }

  // Return with allocations
  const { data: full } = await supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .eq('id', strategy.id)
    .single()

  return full
})
