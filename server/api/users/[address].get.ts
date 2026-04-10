export default defineEventHandler(async (event) => {
  const address = getRouterParam(event, 'address')
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('address', address.toLowerCase())
    .single()

  if (error) return null
  return data
})
