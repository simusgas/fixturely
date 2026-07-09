import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const { id, action } = body

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

    return Response.json({ success: true, action: 'accepted' })
  }

  if (action === 'decline') {
    await supabase
      .from('lesson_requests')
      .update({ status: 'declined' })
      .eq('id', id)

    return Response.json({ success: true, action: 'declined' })
  }
}
