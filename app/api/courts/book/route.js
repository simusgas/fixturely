import { createClient } from '@/lib/supabase/server'
import { bookCourt } from '@/lib/clubspark/book'

export const maxDuration = 60 // Vercel Pro: allow up to 60s for Playwright

const VALID_COURTS = ['Court 13', 'Court 14', 'Court 15', 'Court 16', 'Court 17', 'Court 18']
const MIN_DURATION = 15
const MAX_DURATION = 240

export async function POST(request) {
  // 1. Authenticate the coach
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse and validate inputs
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { courtName, resourceId, date, startMins, durationMins = 60 } = body

  if (!courtName || !date || startMins === undefined) {
    return Response.json({ success: false, error: 'Missing required fields: courtName, date, startMins' }, { status: 400 })
  }

  if (!VALID_COURTS.includes(courtName)) {
    return Response.json({ success: false, error: `Invalid court: ${courtName}` }, { status: 400 })
  }

  if (!Number.isInteger(durationMins) || durationMins < MIN_DURATION || durationMins > MAX_DURATION || durationMins % 15 !== 0) {
    return Response.json({ success: false, error: `Invalid duration: ${durationMins}. Must be 15-240 minutes in 15-minute increments.` }, { status: 400 })
  }

  const startMinsNum = Number(startMins)
  if (isNaN(startMinsNum) || startMinsNum < 360 || startMinsNum > 1320) {
    return Response.json({ success: false, error: 'startMins must be between 360 (6am) and 1320 (10pm)' }, { status: 400 })
  }

  // Validate date is not in the past
  const bookingDate = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (bookingDate < today) {
    return Response.json({ success: false, error: 'Cannot book a court in the past' }, { status: 400 })
  }

  const endMins = startMinsNum + durationMins

  // 3. Insert pending booking record
  const { data: booking, error: insertError } = await supabase
    .from('court_bookings')
    .insert({
      coach_id: user.id,
      court_name: courtName,
      resource_id: resourceId || null,
      date,
      start_mins: startMinsNum,
      end_mins: endMins,
      duration_mins: durationMins,
      status: 'pending',
    })
    .select()
    .single()

  if (insertError) {
    console.error('[Book API] DB insert error:', insertError)
    return Response.json({ success: false, error: 'Failed to create booking record' }, { status: 500 })
  }

  // 4. Attempt the ClubSpark booking via Playwright
  const coachName = user.user_metadata?.full_name || user.user_metadata?.name || user.email
  console.log(`[Book API] Starting ClubSpark booking for ${courtName} on ${date} at ${startMinsNum}min for ${coachName} (booking ID: ${booking.id})`)

  const result = await bookCourt({
    courtName,
    resourceId,
    date,
    startMins: startMinsNum,
    durationMins,
    coachName,
  })

  // 5. Update the booking record with the result
  if (result.success) {
    await supabase
      .from('court_bookings')
      .update({
        status: 'confirmed',
        clubspark_ref: result.bookingRef || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    console.log(`[Book API] Booking confirmed: ${booking.id}`)
    return Response.json({
      success: true,
      bookingId: booking.id,
      bookingRef: result.bookingRef,
    })
  } else {
    await supabase
      .from('court_bookings')
      .update({
        status: 'failed',
        error_message: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    console.error(`[Book API] Booking failed: ${result.error}`)
    return Response.json({
      success: false,
      bookingId: booking.id,
      error: result.error,
    })
  }
}
