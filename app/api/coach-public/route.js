import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

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

  const { data: sessions, error: sessError } = await supabase
    .from('sessions')
    .select('date, time, dur')
    .eq('coach_id', coach.id)
    .in('date', dates)

  if (sessError) {
    console.error('[Coach Public] Sessions error:', sessError)
  }

  // Also load pending requests to avoid double-booking
  const { data: pendingReqs } = await supabase
    .from('lesson_requests')
    .select('requested_date, requested_time')
    .eq('coach_id', coach.id)
    .eq('status', 'pending')
    .in('requested_date', dates)

  // Load working hours and availability from user metadata
  const workStart = coach.user_metadata?.work_start ?? 6
  const workEnd = coach.user_metadata?.work_end ?? 22
  const coachBlocks = coach.user_metadata?.blocks || []
  const coachDaysOff = coach.user_metadata?.days_off || []

  // Calculate available slots per day
  const bookedSessions = sessions || []
  const pendingSlots = pendingReqs || []
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
  const todayStr = dates[0]

  function parseDur(d) {
    if (d === '30m') return 30
    if (d === '45m') return 45
    if (d === '1h') return 60
    const n = parseInt(d)
    return isNaN(n) ? 60 : n
  }

  function isBlockedPublic(dateStr, tM) {
    const d = new Date(dateStr + 'T00:00:00')
    const dow = d.getDay()
    return coachBlocks.some(b => {
      const [bh, bm] = (b.time || '00:00').split(':').map(Number)
      const bStart = bh * 60 + bm
      const bEnd = bStart + parseDur(b.dur || '30m')
      if (b.recur === 'daily') return tM < bEnd && tM + 30 > bStart
      if (b.recur === 'weekdays' && dow >= 1 && dow <= 5) return tM < bEnd && tM + 30 > bStart
      if (b.recur === 'days' && Array.isArray(b.days) && b.days.includes(dow)) return tM < bEnd && tM + 30 > bStart
      if (b.date === dateStr && (b.recur === 'once' || !b.recur)) return tM < bEnd && tM + 30 > bStart
      return false
    })
  }

  const slots = {}
  for (const dateStr of dates) {
    // Check day off
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    if (coachDaysOff.includes(dow)) continue

    const daySlots = []
    const daySess = bookedSessions.filter(s => s.date === dateStr)
    const dayPending = pendingSlots.filter(r => r.requested_date === dateStr)

    for (let h = Math.max(workStart, 7); h <= Math.min(workEnd - 1, 19); h++) {
      const t = `${h.toString().padStart(2, '0')}:00`
      const tM = h * 60

      // Skip past times today
      if (dateStr === todayStr && tM <= nowMins) continue

      // Check blocks
      if (isBlockedPublic(dateStr, tM)) continue

      // Check session conflicts
      const taken = daySess.some(s => {
        const [sh, sm] = s.time.split(':').map(Number)
        const sStart = sh * 60 + sm
        const sEnd = sStart + parseDur(s.dur)
        return tM < sEnd && tM + 60 > sStart
      })

      // Check pending request conflicts
      const pendingConflict = dayPending.some(r => r.requested_time === t)

      if (!taken && !pendingConflict) daySlots.push(t)
    }
    if (daySlots.length > 0) slots[dateStr] = daySlots
  }

  return Response.json({
    coachName: coach.user_metadata?.full_name || 'Coach',
    coachId: coach.id,
    slots,
  })
}
