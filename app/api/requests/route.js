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

  const { coachId, studentName, contact, message, date, time } = body

  if (!coachId || !studentName || !contact || !date || !time) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Use admin client since this is an unauthenticated request
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lesson_requests')
    .insert({
      coach_id: coachId,
      student_name: studentName.trim(),
      contact: contact.trim(),
      message: (message || '').trim(),
      requested_date: date,
      requested_time: time,
      status: 'pending',
    })
    .select()
    .single()

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
        dur: '1h',
        court: '',
        recur: 'One-time',
        date: req.requested_date,
        pay_status: 'unpaid',
        notes: req.message || '',
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
