export default defineEventHandler(async (event) => {
  const { address } = await readBody(event)
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const supabase = useServerSupabase()
  const addr = address.toLowerCase()

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('address', addr)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from('users')
    .insert({ address: addr })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return created
})
