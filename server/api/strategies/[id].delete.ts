// DELETE /api/strategies/:id — soft delete (marks deleted_at, keeps row for FK integrity)
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event).catch(() => ({}))
  if (!id) throw createError({ statusCode: 400, message: 'Missing id' })
  if (!body?.user_id) throw createError({ statusCode: 400, message: 'Missing user_id' })

  const supabase = useServerSupabase()

  // Ownership check
  const { data: strategy } = await supabase
    .from('strategies')
    .select('creator_id')
    .eq('id', id)
    .single()

  if (!strategy || strategy.creator_id !== body.user_id) {
    throw createError({ statusCode: 403, message: 'Not authorized' })
  }

  const { error } = await supabase
    .from('strategies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { ok: true }
})
