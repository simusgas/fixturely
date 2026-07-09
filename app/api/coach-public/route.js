import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  // Which schedule to publish: main (this term) / next-term / school-holidays
  const CALS = ['main', 'next-term', 'school-holidays']
  const cal = CALS.includes(searchParams.get('cal')) ? searchParams.get('cal') : 'main'

  if (!slug) {
    return Response.json({ error: 'Missing slug' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find coach by slug (slugify full_name and match)
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  if (usersError) {
    console.error('[Coach Public] List users error:', usersError)
    return Response.json({ error: 'Failed to find coach' }, { status: 500 })
  }

  function slugify(name) {
    return (name || 'coach').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  const coach = users.find(u => slugify(u.user_metadata?.full_name) === slug)

  if (!coach) {
    return Response.json({ error: 'Coach not found' }, { status: 404 })
  }

  // Load coach's sessions for next 14 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }

  // Fetch the sessions that can affect the visible window:
  //   • one-time lessons dated inside [today, windowEnd]
  //   • every recurring lesson (Weekly/Fortnightly), whatever its original date,
  //     since it expands forward into the window (handled by occursOn below).
  // Bounding it this way keeps the result small — an unbounded fetch silently
  // hits Supabase's 1000-row cap for busy coaches and drops the very rows we
  // need, which made far-out days wrongly show as fully free.
  const windowStart = dates[0]
  const windowEnd = dates[dates.length - 1]
  const { data: sessions, error: sessError } = await supabase
    .from('sessions')
    .select('*')
    .eq('coach_id', coach.id)
    .lte('date', windowEnd)
    .or(`date.gte.${windowStart},recur.eq.Weekly,recur.eq.Fortnightly`)
    .limit(2000)

  if (sessError) {
    console.error('[Coach Public] Sessions error:', sessError)
  }

  // Availability reflects the requested schedule only (this term / next term /
  // holidays). Untagged rows count as the live 'main' calendar.
  const mainSessions = (sessions || []).filter(s => (s.calendar || 'main') === cal)

  // Also load pending requests to avoid double-booking
  // Select * so this works before and after the requested_dur migration
  const { data: pendingReqs } = await supabase
    .from('lesson_requests')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('status', 'pending')
    .in('requested_date', dates)

  // Load working hours and availability from user metadata
  const workStart = coach.user_metadata?.work_start ?? 6
  const workEnd = coach.user_metadata?.work_end ?? 22
  const coachBlocks = coach.user_metadata?.blocks || []
  const coachDaysOff = coach.user_metadata?.days_off || []

  // Build anonymized busy intervals per day — the public page renders the same
  // week grid as the coach's share preview, so it needs intervals, not free hours.
  // Sessions, share-blocks, and pending requests all collapse into plain "busy";
  // nothing about their origin leaves the server.
  const pendingSlots = pendingReqs || []

  // Interpret every duration format that has ever been stored, in minutes. A
  // miss here silently mis-sizes a booked lesson and leaks its time as free
  // (e.g. parseInt('1.5h') === 1). Covers: '30m'/'90m', '1h'/'1.5h', '1 hour'/
  // '1.5 hrs', bare numbers ('90'). Unknown → 60 (safer to over-block than leak).
  function parseDur(d) {
    if (typeof d === 'number') return d
    if (!d) return 60
    const s = String(d).trim().toLowerCase()
    let m
    if ((m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)$/.exec(s))) return Math.round(parseFloat(m[1]) * 60)
    if ((m = /^(\d+)\s*(m|min|mins|minute|minutes)$/.exec(s))) return parseInt(m[1])
    const n = parseFloat(s)
    return isNaN(n) ? 60 : Math.round(n) // bare number = minutes
  }

  function t2m(t) {
    const [h, m] = (t || '00:00').split(':').map(Number)
    return h * 60 + m
  }

  function blockIntervals(dateStr, dow) {
    const out = []
    for (const b of coachBlocks) {
      const applies =
        b.recur === 'daily' ||
        (b.recur === 'weekdays' && dow >= 1 && dow <= 5) ||
        (b.recur === 'days' && Array.isArray(b.days) && b.days.includes(dow)) ||
        ((b.recur === 'once' || !b.recur) && b.date === dateStr)
      if (!applies) continue
      const s = t2m(b.time)
      out.push([s, s + parseDur(b.dur || '30m')])
    }
    return out
  }

  // Same expansion rules as the app's getSessionsForDate (DB snake_case columns)
  function occursOn(s, dateStr) {
    if (s.cancelled_dates && s.cancelled_dates.includes(dateStr)) return false
    if (s.recur_end && dateStr > s.recur_end) return false
    if (s.date === dateStr) return true
    if (s.recur === 'Weekly' || s.recur === 'Fortnightly') {
      const target = new Date(dateStr + 'T00:00:00')
      const orig = new Date(s.date + 'T00:00:00')
      if (target <= orig || target.getDay() !== orig.getDay()) return false
      const diffDays = Math.round((target - orig) / 86400000)
      return s.recur === 'Weekly' ? diffDays % 7 === 0 : diffDays % 14 === 0
    }
    return false
  }

  function mergeIntervals(list) {
    const sorted = [...list].sort((a, b) => a[0] - b[0])
    const merged = []
    for (const [s, e] of sorted) {
      const last = merged[merged.length - 1]
      if (last && s <= last[1]) last[1] = Math.max(last[1], e)
      else merged.push([s, e])
    }
    return merged
  }

  // Privacy: only available start times leave the server — never the shape of
  // the coach's day. Each slot lists which durations fit (back-to-back with the
  // next booking is allowed: a lesson may end exactly when something starts).
  const DUR_MINS = [['30m', 30], ['45m', 45], ['1h', 60]]
  const weeklyHours = coach.user_metadata?.weekly_hours || {}

  // Per-day bookable window (+ optional lunch break), falling back to the
  // global work hours — mirrors dayHours() in the coach app.
  function dayWindow(dow) {
    const wh = weeklyHours[dow]
    if (wh && typeof wh.s === 'number' && typeof wh.e === 'number') return wh
    return { s: workStart * 60, e: workEnd * 60, bs: null, be: null }
  }

  function fitsAt(startMin, durMin, busy, dayEndM) {
    if (startMin + durMin > dayEndM) return false
    return !busy.some(([s, e]) => startMin < e && startMin + durMin > s)
  }

  function mToTime(m) {
    return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`
  }

  const days = dates.map(dateStr => {
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    if (coachDaysOff.includes(dow)) return { date: dateStr, slots: [] }

    const wh = dayWindow(dow)
    const busy = mergeIntervals([
      ...mainSessions.filter(s => occursOn(s, dateStr))
        .map(s => [t2m(s.time), t2m(s.time) + parseDur(s.dur)]),
      ...pendingSlots.filter(r => r.requested_date === dateStr && (r.requested_cal || 'main') === cal)
        .map(r => [t2m(r.requested_time), t2m(r.requested_time) + parseDur(r.requested_dur || '1h')]),
      ...blockIntervals(dateStr, dow),
      ...(wh.bs != null ? [[wh.bs, wh.be]] : []), // lunch break
    ])

    const daySlots = []
    for (let m = wh.s; m + 30 <= wh.e; m += 30) {
      const durs = DUR_MINS.filter(([, mins]) => fitsAt(m, mins, busy, wh.e)).map(([lbl]) => lbl)
      if (durs.length) daySlots.push({ time: mToTime(m), durs })
    }
    return { date: dateStr, slots: daySlots }
  })

  return Response.json({
    coachName: coach.user_metadata?.full_name || 'Coach',
    coachId: coach.id,
    days,
  })
}
