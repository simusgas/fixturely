import { createClient } from '@/lib/supabase/server'
import { getCalendarClient } from '@/lib/google/calendar'

export async function GET(request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const calendarId = searchParams.get('calendarId')

  if (!calendarId) {
    return Response.json({ error: 'Missing calendarId' }, { status: 400 })
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

  // Save selected calendar
  if (tokenRow.calendar_id !== calendarId) {
    await supabase
      .from('google_tokens')
      .update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
      .eq('coach_id', user.id)
  }

  try {
    const calendar = await getCalendarClient(
      { access_token: tokenRow.access_token, refresh_token: tokenRow.refresh_token, expiry_date: tokenRow.expiry_date },
      supabase,
      user.id
    )

    // Fetch events: past 7 days + next 60 days
    const now = new Date()
    const timeMin = new Date(now)
    timeMin.setDate(timeMin.getDate() - 7)
    const timeMax = new Date(now)
    timeMax.setDate(timeMax.getDate() + 60)

    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    const events = (res.data.items || [])
      .filter(e => e.start?.dateTime) // Skip all-day events
      .map(e => {
        const start = new Date(e.start.dateTime)
        const end = e.end?.dateTime ? new Date(e.end.dateTime) : null
        const durMins = end ? Math.round((end - start) / 60000) : 60

        return {
          id: e.id,
          name: e.summary || 'Untitled',
          date: start.toISOString().slice(0, 10),
          time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
          durMins,
          location: e.location || '',
        }
      })
      .filter(e => e.durMins > 0 && e.durMins <= 480)

    return Response.json({ events })
  } catch (err) {
    console.error('[GCal Events] API error:', err.message)
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      await supabase.from('google_tokens').delete().eq('coach_id', user.id)
      return Response.json({ error: 'Google authorization expired. Please reconnect.' }, { status: 401 })
    }
    return Response.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}
