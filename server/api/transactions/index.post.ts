export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.pocket_id || !body?.type || !body?.amount || !body?.tx_hash) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .upsert(body, { onConflict: 'tx_hash' })
    .select()
    .single()

  if (error) {
    console.error('[transactions] POST error:', error.message, error.code, error.details)
    throw createError({ statusCode: 500, message: error.message })
  }
  return data
})
