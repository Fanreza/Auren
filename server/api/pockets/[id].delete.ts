export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing pocket id' })

  const supabase = useServerSupabase()

  // Delete transactions for this pocket first (defense-in-depth alongside DB CASCADE)
  await supabase.from('transactions').delete().eq('pocket_id', id)

  const { error } = await supabase
    .from('pockets')
    .delete()
    .eq('id', id)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
