export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing pocket id' })

  const body = await readBody(event)
  const supabase = useServerSupabase()

  const { error } = await supabase
    .from('pockets')
    .update(body)
    .eq('id', id)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
