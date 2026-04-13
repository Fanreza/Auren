export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.user_id || !body?.name || !body?.strategy_key) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }
  if (!body?.vault_address || !body?.vault_chain_id) {
    throw createError({ statusCode: 400, message: 'Missing vault info' })
  }

  // Allocations required — at minimum one entry with weight=1 for single-vault pockets
  const allocations: Array<any> = Array.isArray(body.allocations) ? body.allocations : []
  if (allocations.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one allocation required' })
  }
  const totalWeight = allocations.reduce((s, a) => s + (Number(a.weight) || 0), 0)
  if (Math.abs(totalWeight - 1) > 0.001) {
    throw createError({ statusCode: 400, message: `Allocation weights must sum to 1.0 (got ${totalWeight})` })
  }

  const supabase = useServerSupabase()

  const { data: pocket, error } = await supabase
    .from('pockets')
    .insert({
      user_id: body.user_id,
      name: body.name,
      purpose: body.purpose ?? null,
      timeline: body.timeline ?? null,
      target_amount: body.target_amount ?? null,
      strategy_key: body.strategy_key,
      vault_address: body.vault_address,
      vault_chain_id: body.vault_chain_id,
      vault_protocol: body.vault_protocol ?? null,
      vault_symbol: body.vault_symbol ?? null,
      vault_asset: body.vault_asset ?? null,
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  // Insert allocations in a single batch
  const allocRows = allocations.map((a, i) => ({
    pocket_id: pocket.id,
    vault_address: a.vault_address,
    vault_chain_id: a.vault_chain_id ?? body.vault_chain_id,
    protocol: a.protocol ?? null,
    vault_symbol: a.vault_symbol ?? null,
    asset_symbol: a.asset_symbol ?? null,
    asset_address: a.asset_address ?? null,
    weight: a.weight,
    display_order: a.display_order ?? i,
  }))

  const { error: allocErr } = await supabase
    .from('pocket_allocations')
    .insert(allocRows)

  if (allocErr) {
    // Roll back the pocket so we don't leave an orphan row with no allocations
    await supabase.from('pockets').delete().eq('id', pocket.id)
    throw createError({ statusCode: 500, message: `Allocation insert failed: ${allocErr.message}` })
  }

  // Return the pocket with its fresh allocations joined
  const { data: full } = await supabase
    .from('pockets')
    .select('*, allocations:pocket_allocations(*)')
    .eq('id', pocket.id)
    .single()

  if (full && Array.isArray((full as any).allocations)) {
    (full as any).allocations.sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
  }

  return full ?? pocket
})
