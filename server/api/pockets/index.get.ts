export default defineEventHandler(async (event) => {
  const { user_id } = getQuery(event) as { user_id: string }
  if (!user_id) throw createError({ statusCode: 400, message: 'Missing user_id' })

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('pockets')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data ?? []
})
