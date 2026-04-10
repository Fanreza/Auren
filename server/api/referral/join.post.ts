// Accept a referral code — link new user to referrer
export default defineEventHandler(async (event) => {
  const { address, code } = await readBody(event)
  if (!address || !code) throw createError({ statusCode: 400, message: 'Missing address or code' })

  const supabase = useServerSupabase()
  const addr = address.toLowerCase()

  // Find referrer by code
  const { data: referrer } = await supabase
    .from('users')
    .select('address')
    .eq('referral_code', code.toUpperCase())
    .maybeSingle()

  if (!referrer) throw createError({ statusCode: 404, message: 'Invalid referral code' })
  if (referrer.address === addr) throw createError({ statusCode: 400, message: 'Cannot refer yourself' })

  // Check if user already has a referrer
  const { data: user } = await supabase
    .from('users')
    .select('referred_by')
    .ilike('address', addr)
    .maybeSingle()

  if (!user) throw createError({ statusCode: 404, message: 'User not found' })
  if (user.referred_by) return { ok: true, already: true }

  // Set referred_by on the new user
  const { error: updateError } = await supabase
    .from('users')
    .update({ referred_by: referrer.address })
    .eq('address', addr)

  if (updateError) throw createError({ statusCode: 500, message: updateError.message })

  // Increment referrer's count
  await supabase.rpc('increment_referral_count', { referrer_address: referrer.address })
    .then(() => {})
    .catch(() => {
      // Fallback: manual increment if RPC doesn't exist
      supabase
        .from('users')
        .update({ referral_count: (referrer as any).referral_count + 1 })
        .eq('address', referrer.address)
    })

  return { ok: true }
})
