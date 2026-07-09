import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Email the coach when a new request lands. Uses Resend if configured; a no-op
// (never throws, never blocks the request) when RESEND_API_KEY is unset.
async function notifyCoachOfRequest(supabase, coachId, req) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    const { data } = await supabase.auth.admin.getUserById(coachId)
    const to = data?.user?.email
    if (!to) return
    const from = process.env.NOTIFY_FROM || 'Fixturely <onboarding@resend.dev>'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fixturely.app'

    const d = new Date(req.requested_date + 'T00:00:00')
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const [h, m] = (req.requested_time || '0:0').split(':').map(Number)
    const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    const when = `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} at ${time}`
    const durLbl = { '30m': '30 min', '45m': '45 min', '1h': '1 hour' }[req.requested_dur] || req.requested_dur || '1 hour'
    const recur = req.requested_recur === 'Weekly' ? ' · Weekly' : ''

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
        <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:16px;padding:24px;text-align:center;color:#fff">
          <div style="font-size:26px">🎾</div>
          <div style="font-size:19px;font-weight:800;margin-top:6px">New lesson request</div>
        </div>
        <div style="padding:22px 4px">
          <p style="font-size:15px;margin:0 0 16px"><b>${req.student_name}</b> requested a lesson:</p>
          <table style="font-size:14px;line-height:1.9;color:#475569">
            <tr><td>🗓️ When</td><td style="padding-left:12px;color:#0F172A;font-weight:700">${when}</td></tr>
            <tr><td>⏱️ Length</td><td style="padding-left:12px;color:#0F172A;font-weight:700">${durLbl}${recur}</td></tr>
            <tr><td>📇 Contact</td><td style="padding-left:12px;color:#0F172A;font-weight:700">${req.contact || '—'}</td></tr>
          </table>
          ${req.message ? `<p style="font-size:14px;font-style:italic;color:#475569;background:#F7F8FC;border-radius:10px;padding:12px 14px;margin:16px 0">"${req.message}"</p>` : ''}
          <a href="${appUrl}" style="display:inline-block;margin-top:8px;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 26px;border-radius:100px;font-weight:800;font-size:14px">Open Fixturely to respond →</a>
        </div>
      </div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `New lesson request from ${req.student_name}`, html }),
    })
  } catch (e) {
    console.error('[Requests] Coach notification failed:', e)
  }
}

function contactKind(c) {
  if (!c) return null
  const t = c.trim()
  if (/@/.test(t)) return 'email'
  return t.replace(/[^0-9]/g, '').length >= 6 ? 'phone' : 'other'
}
async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const from = process.env.NOTIFY_FROM || 'Fixturely <onboarding@resend.dev>'
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    return r.ok
  } catch (e) { console.error('[Requests] sendEmail failed:', e); return false }
}
// Email the student that their request was accepted/declined. Only for email
// contacts (phone is handled in-app via Messages). No-op without RESEND_API_KEY.
async function emailStudentDecision(req, coachName, accepted, customMessage) {
  const c = (req.contact || '').trim()
  if (contactKind(c) !== 'email') return { notified: false }
  const d = new Date(req.requested_date + 'T00:00:00')
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [h, m] = (req.requested_time || '0:0').split(':').map(Number)
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  const when = `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} at ${time}`
  const first = (req.student_name || 'there').split(' ')[0]
  const def = accepted
    ? `Hi ${first}, ${coachName} has accepted your lesson request for ${when}. See you on court! 🎾`
    : `Hi ${first}, unfortunately ${coachName} can't make a lesson on ${when}. Feel free to request another time.`
  const text = (customMessage && customMessage.trim()) ? customMessage.trim() : def
  const heading = accepted ? 'Lesson confirmed 🎾' : 'About your lesson request'
  const bar = accepted ? '#4F46E5,#7C3AED' : '#64748B,#475569'
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
    <div style="background:linear-gradient(135deg,${bar});border-radius:16px;padding:22px;text-align:center;color:#fff">
      <div style="font-size:26px">🎾</div><div style="font-size:18px;font-weight:800;margin-top:6px">${heading}</div>
    </div>
    <p style="font-size:15px;line-height:1.6;padding:20px 4px 0;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</p>
  </div>`
  const ok = await sendEmail(c, accepted ? 'Your lesson is confirmed' : 'About your lesson request', html)
  return { notified: ok }
}

// GET — Coach fetches their pending requests (auth required)
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('lesson_requests')
    .select('*')
    .eq('coach_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Requests] Fetch error:', error)
    return Response.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }

  return Response.json({ requests: data || [] })
}

// POST — Public: student submits a request (no auth)
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { coachId, studentName, contact, message, date, time, dur, recur, calendar } = body

  if (!coachId || !studentName || !contact || !date || !time) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // The form requires an explicit one-time/weekly choice
  if (!['One-time', 'Weekly'].includes(recur)) {
    return Response.json({ error: 'Missing lesson frequency' }, { status: 400 })
  }

  const requestedDur = ['30m', '45m', '1h'].includes(dur) ? dur : '1h'

  // Use admin client since this is an unauthenticated request
  const supabase = createAdminClient()

  const row = {
    coach_id: coachId,
    student_name: studentName.trim(),
    contact: contact.trim(),
    message: (message || '').trim(),
    requested_date: date,
    requested_time: time,
    requested_dur: requestedDur,
    requested_recur: recur,
    requested_cal: ['main', 'next-term', 'school-holidays'].includes(calendar) ? calendar : 'main',
    status: 'pending',
  }

  let { data, error } = await supabase
    .from('lesson_requests')
    .insert(row)
    .select()
    .single()

  // Retry without the newer columns if their migration isn't applied yet
  if (error) {
    const missing = ['requested_dur', 'requested_recur', 'requested_cal'].filter(c => `${error.message}`.includes(c))
    if (missing.length) {
      missing.forEach(c => delete row[c])
      ;({ data, error } = await supabase.from('lesson_requests').insert(row).select().single())
    }
  }

  if (error) {
    console.error('[Requests] Insert error:', error)
    return Response.json({ error: 'Failed to submit request' }, { status: 500 })
  }

  // Let the coach know (best-effort; never blocks the student's confirmation)
  await notifyCoachOfRequest(supabase, coachId, row)

  return Response.json({ success: true, request: data })
}

// PATCH — Coach accepts or declines a request (auth required)
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, action, message } = body

  if (!id || !['accept', 'decline'].includes(action)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Fetch the request to verify ownership
  const { data: req, error: fetchError } = await supabase
    .from('lesson_requests')
    .select('*')
    .eq('id', id)
    .eq('coach_id', user.id)
    .single()

  if (fetchError || !req) {
    return Response.json({ error: 'Request not found' }, { status: 404 })
  }

  if (action === 'accept') {
    // Create session
    const { error: sessError } = await supabase
      .from('sessions')
      .insert({
        coach_id: user.id,
        student: req.student_name,
        level: '',
        time: req.requested_time,
        dur: req.requested_dur || '1h',
        court: '',
        recur: req.requested_recur || 'One-time',
        date: req.requested_date,
        pay_status: 'unpaid',
        notes: req.message || '',
        calendar: req.requested_cal || 'main',
      })

    if (sessError) {
      console.error('[Requests] Create session error:', sessError)
      return Response.json({ error: 'Failed to create session' }, { status: 500 })
    }

    // Update request status
    await supabase
      .from('lesson_requests')
      .update({ status: 'accepted' })
      .eq('id', id)

    const coachName = user.user_metadata?.full_name || 'Your coach'
    const { notified } = await emailStudentDecision(req, coachName, true, message)
    return Response.json({ success: true, action: 'accepted', notified })
  }

  if (action === 'decline') {
    await supabase
      .from('lesson_requests')
      .update({ status: 'declined' })
      .eq('id', id)

    const coachName = user.user_metadata?.full_name || 'Your coach'
    const { notified } = await emailStudentDecision(req, coachName, false, message)
    return Response.json({ success: true, action: 'declined', notified })
  }
}
