export default defineEventHandler(async (event) => {
  const address = getRouterParam(event, 'address')
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const { display_name } = await readBody(event)

  const supabase = useServerSupabase()

  const { error } = await supabase
    .from('users')
    .update({ display_name })
    .eq('address', address.toLowerCase())

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
