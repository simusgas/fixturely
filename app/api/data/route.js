import { createClient } from '@/lib/supabase/server'

// GET /api/data — load all coach data in one call
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [students, sessions, terms, holidays, invoices] = await Promise.all([
    supabase.from('students').select('*').order('created_at'),
    supabase.from('sessions').select('*').order('created_at'),
    supabase.from('terms').select('*').order('created_at'),
    supabase.from('holidays').select('*').order('created_at'),
    supabase.from('invoices').select('*').order('created_at'),
  ])

  // Check for errors
  for (const [name, result] of [['students', students], ['sessions', sessions], ['terms', terms], ['holidays', holidays], ['invoices', invoices]]) {
    if (result.error) {
      console.error(`[Data API] Error loading ${name}:`, result.error)
      return Response.json({ error: `Failed to load ${name}` }, { status: 500 })
    }
  }

  return Response.json({
    students: students.data,
    sessions: sessions.data.map(s => ({
      ...s,
      payStatus: s.pay_status,
    })),
    terms: terms.data,
    holidays: holidays.data,
    invoices: invoices.data,
  })
}

// POST /api/data — create/update/delete records
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, table, record, id } = body

  const allowedTables = ['students', 'sessions', 'terms', 'holidays', 'invoices']
  if (!allowedTables.includes(table)) {
    return Response.json({ error: 'Invalid table' }, { status: 400 })
  }

  if (action === 'insert') {
    const row = { ...record, coach_id: user.id }
    // Map payStatus -> pay_status for sessions table
    if (table === 'sessions' && 'payStatus' in row) {
      row.pay_status = row.payStatus
      delete row.payStatus
    }
    const { data, error } = await supabase.from(table).insert(row).select().single()
    if (error) {
      console.error(`[Data API] Insert ${table} error:`, error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    // Map pay_status back to payStatus for sessions
    if (table === 'sessions' && data) {
      data.payStatus = data.pay_status
    }
    return Response.json({ success: true, record: data })
  }

  if (action === 'update') {
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
    const updates = { ...record }
    if (table === 'sessions' && 'payStatus' in updates) {
      updates.pay_status = updates.payStatus
      delete updates.payStatus
    }
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single()
    if (error) {
      console.error(`[Data API] Update ${table} error:`, error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    if (table === 'sessions' && data) {
      data.payStatus = data.pay_status
    }
    return Response.json({ success: true, record: data })
  }

  if (action === 'delete') {
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      console.error(`[Data API] Delete ${table} error:`, error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ success: true })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}
