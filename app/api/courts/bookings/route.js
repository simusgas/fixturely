import { createClient } from '@/lib/supabase/server'

export async function GET(request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date) {
    return Response.json({ error: 'Missing date parameter' }, { status: 400 })
  }

  const { data: bookings, error } = await supabase
    .from('court_bookings')
    .select('*')
    .eq('date', date)
    .in('status', ['pending', 'confirmed'])
    .order('start_mins', { ascending: true })

  if (error) {
    console.error('[Bookings API] Query error:', error)
    return Response.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  // Filter out stale pending bookings (older than 2 minutes — the bot should
  // have finished by then, so these are stuck/failed)
  const now = Date.now()
  const filtered = bookings.filter(b => {
    if (b.status === 'confirmed') return true
    // Pending: only show if created within last 2 minutes
    const age = now - new Date(b.created_at).getTime()
    return age < 2 * 60 * 1000
  })

  return Response.json({ bookings: filtered })
}
