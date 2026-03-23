import { createClient } from '@/lib/supabase/server'
import { getCalendarClient } from '@/lib/google/calendar'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Load tokens
  const { data: tokenRow, error: dbError } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('coach_id', user.id)
    .single()

  if (dbError || !tokenRow) {
    return Response.json({ error: 'Google Calendar not connected' }, { status: 404 })
  }

  try {
    const calendar = await getCalendarClient(
      { access_token: tokenRow.access_token, refresh_token: tokenRow.refresh_token, expiry_date: tokenRow.expiry_date },
      supabase,
      user.id
    )

    const res = await calendar.calendarList.list()
    const calendars = (res.data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
    }))

    return Response.json({ calendars, selectedId: tokenRow.calendar_id || null })
  } catch (err) {
    console.error('[GCal Calendars] API error:', err.message)
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      // Token revoked — clean up
      await supabase.from('google_tokens').delete().eq('coach_id', user.id)
      return Response.json({ error: 'Google authorization expired. Please reconnect.' }, { status: 401 })
    }
    return Response.json({ error: 'Failed to fetch calendars' }, { status: 500 })
  }
}
