export default defineEventHandler(async (event) => {
  const { pocket_id } = getQuery(event)

  if (!pocket_id) {
    throw createError({ statusCode: 400, message: 'Missing pocket_id' })
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('pocket_id', pocket_id)
    .order('timestamp', { ascending: false })

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data ?? []
})
