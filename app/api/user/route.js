import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  return Response.json({
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name || '',
  })
}

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
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { fullName, email, password } = body

  // Build the update object
  const update = {}
  if (fullName !== undefined) {
    const trimmed = fullName.trim()
    if (!trimmed) return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
    update.data = { full_name: trimmed }
  }
  if (email !== undefined) {
    const trimmed = email.trim()
    if (!trimmed) return Response.json({ error: 'Email cannot be empty' }, { status: 400 })
    update.email = trimmed
  }
  if (password !== undefined) {
    if (password.length < 6) return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    update.password = password
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser(update)

  if (error) {
    return Response.json({ error: error.message || 'Failed to update profile' }, { status: 500 })
  }

  return Response.json({
    success: true,
    fullName: update.data?.full_name || user.user_metadata?.full_name || '',
    email: update.email || user.email,
    emailChanged: !!update.email,
  })
}
