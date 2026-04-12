// PATCH /api/strategies/:id — update owner-created strategy + replace allocations.
// System strategies are immutable. Forked copies are independent entities —
// editing them doesn't affect the original or any other copies.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  if (!id || !body?.user_id) {
    throw createError({ statusCode: 400, message: 'Missing fields' })
  }

  const supabase = useServerSupabase()

  // Ownership + immutability check
  const { data: existing, error: fetchErr } = await supabase
    .from('strategies')
    .select('creator_id, is_system')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchErr || !existing) {
    throw createError({ statusCode: 404, message: 'Strategy not found' })
  }
  if (existing.is_system) {
    throw createError({ statusCode: 403, message: 'System strategies are immutable' })
  }
  if (existing.creator_id !== body.user_id) {
    throw createError({ statusCode: 403, message: 'Not authorized' })
  }

  // Validate allocations if provided
  if (body.allocations) {
    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      throw createError({ statusCode: 400, message: 'At least one allocation required' })
    }
    const totalWeight = body.allocations.reduce(
      (s: number, a: any) => s + (Number(a.weight) || 0),
      0,
    )
    if (Math.abs(totalWeight - 1) > 0.001) {
      throw createError({
        statusCode: 400,
        message: `Allocation weights must sum to 100% (got ${(totalWeight * 100).toFixed(2)}%)`,
      })
    }
    const seen = new Set<string>()
    for (const a of body.allocations) {
      const key = String(a.vault_address).toLowerCase()
      if (seen.has(key)) {
        throw createError({ statusCode: 400, message: 'Duplicate vault in allocations' })
      }
      seen.add(key)
    }
  }

  // Build patch object — only include fields that were passed
  const patch: Record<string, any> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.risk_level !== undefined) patch.risk_level = body.risk_level
  if (body.visibility !== undefined) patch.visibility = body.visibility
  if (body.cover_color !== undefined) patch.cover_color = body.cover_color
  if (body.icon !== undefined) patch.icon = body.icon

  // Update strategy metadata
  if (Object.keys(patch).length) {
    const { error: updateErr } = await supabase
      .from('strategies')
      .update(patch)
      .eq('id', id)
    if (updateErr) {
      if (updateErr.code === '23505') {
        throw createError({ statusCode: 409, message: 'You already have a strategy with this name' })
      }
      throw createError({ statusCode: 500, message: updateErr.message })
    }
  }

  // Replace allocations atomically (delete old → insert new)
  if (body.allocations) {
    const { error: delErr } = await supabase
      .from('strategy_allocations')
      .delete()
      .eq('strategy_id', id)
    if (delErr) throw createError({ statusCode: 500, message: delErr.message })

    const allocRows = body.allocations.map((a: any, i: number) => ({
      strategy_id: id,
      vault_address: a.vault_address,
      vault_chain_id: a.vault_chain_id,
      protocol: a.protocol ?? null,
      vault_symbol: a.vault_symbol ?? null,
      asset_symbol: a.asset_symbol ?? null,
      asset_address: a.asset_address ?? null,
      weight: a.weight,
      display_order: a.display_order ?? i,
    }))

    const { error: insertErr } = await supabase
      .from('strategy_allocations')
      .insert(allocRows)
    if (insertErr) throw createError({ statusCode: 500, message: insertErr.message })
  }

  // Return updated strategy
  const { data: full } = await supabase
    .from('strategies')
    .select('*, strategy_allocations(*)')
    .eq('id', id)
    .single()

  return full
})
