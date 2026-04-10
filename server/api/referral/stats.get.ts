// GET /api/referral/stats?address=0x...
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const address = (query.address as string)?.toLowerCase()
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const supabase = useServerSupabase()

  const { data: user } = await supabase
    .from('users')
    .select('referral_code, referral_count, referred_by')
    .ilike('address', address)
    .maybeSingle()

  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  // Get list of referred users (display names)
  const { data: referrals } = await supabase
    .from('users')
    .select('address, display_name, created_at')
    .eq('referred_by', address)
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    code: user.referral_code,
    count: user.referral_count || 0,
    referred_by: user.referred_by,
    referrals: (referrals || []).map((r: any) => ({
      address: r.address,
      name: r.display_name,
      joined: r.created_at,
    })),
  }
})
