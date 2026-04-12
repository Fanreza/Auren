export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.user_id || !body?.name || !body?.strategy_key) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }
  if (!body?.vault_address || !body?.vault_chain_id) {
    throw createError({ statusCode: 400, message: 'Missing vault info' })
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
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
    // Unique constraint violation = vault already used by another pocket of this user
    if (error.code === '23505' || /unique/i.test(error.message)) {
      throw createError({
        statusCode: 409,
        message: 'You already have a pocket using this vault',
      })
    }
    throw createError({ statusCode: 500, message: error.message })
  }
  return data
})
