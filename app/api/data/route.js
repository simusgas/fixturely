import { createClient } from '@/lib/supabase/server'

// GET /api/data — load all coach data in one call
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Load each table individually — if a table doesn't exist yet, return []
  async function safeSelect(table) {
    const { data, error } = await supabase.from(table).select('*').order('created_at')
    if (error) {
      console.error(`[Data API] Error loading ${table}:`, error.message)
      return []
    }
    return data || []
  }

  const [students, sessions, terms, holidays, invoices] = await Promise.all([
    safeSelect('students'),
    safeSelect('sessions'),
    safeSelect('terms'),
    safeSelect('holidays'),
    safeSelect('invoices'),
  ])

  return Response.json({
    students,
    sessions: sessions.map(s => ({
      ...s,
      payStatus: s.pay_status,
    })),
    terms,
    holidays,
    invoices,
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
    // Remove id field if present — let Supabase generate it
    delete row.id
    let { data, error } = await supabase.from(table).insert(row).select().single()
    // If insert fails due to unknown column (e.g. phone), retry without it
    if (error && error.message && error.message.includes('column')) {
      console.warn(`[Data API] Insert ${table} retrying without unknown columns:`, error.message)
      // Strip to known columns per table
      const known = {
        students: ['coach_id', 'name', 'level', 'credits', 'sessions', 'owing', 'phone'],
        sessions: ['coach_id', 'student', 'level', 'time', 'dur', 'court', 'recur', 'date', 'pay_status', 'notes'],
        terms: ['coach_id', 'name', 'start', 'end', 'weeks'],
        holidays: ['coach_id', 'name', 'start', 'end'],
        invoices: ['coach_id', 'invoice_number', 'student', 'amount', 'status', 'date', 'items'],
      }
      const cols = known[table]
      if (cols) {
        const cleaned = {}
        for (const k of cols) { if (k in row) cleaned[k] = row[k] }
        const retry = await supabase.from(table).insert(cleaned).select().single()
        data = retry.data
        error = retry.error
      }
    }
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
