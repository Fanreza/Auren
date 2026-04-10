export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.user_id || !body?.name || !body?.strategy_key)
    throw createError({ statusCode: 400, message: 'Missing required fields' })

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('pockets')
    .insert(body)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
