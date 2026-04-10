// POST /api/referral/generate { address, code? }
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const address = body?.address?.toLowerCase()
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const customCode = body?.code?.toUpperCase()?.replace(/[^A-Z0-9]/g, '')

  const supabase = useServerSupabase()

  // Find user (case-insensitive)
  const { data: user } = await supabase
    .from('users')
    .select('id, referral_code')
    .ilike('address', address)
    .maybeSingle()

  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  // If custom code requested, validate and set it
  if (customCode) {
    if (customCode.length < 3 || customCode.length > 12) {
      throw createError({ statusCode: 400, message: 'Code must be 3-12 characters' })
    }

    // Check if code is taken
    const { data: taken } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', customCode)
      .maybeSingle()

    if (taken && taken.id !== user.id) {
      throw createError({ statusCode: 409, message: 'Code already taken' })
    }

    const { error } = await supabase
      .from('users')
      .update({ referral_code: customCode })
      .eq('id', user.id)

    if (error) throw createError({ statusCode: 500, message: error.message })
    return { code: customCode }
  }

  // Return existing code
  if (user.referral_code) return { code: user.referral_code }

  // Generate unique 6-char code
  let code = ''
  for (let i = 0; i < 10; i++) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle()
    if (!existing) break
  }

  const { error } = await supabase
    .from('users')
    .update({ referral_code: code })
    .eq('id', user.id)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { code }
})
