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

  const fullName = body.fullName?.trim()
  if (!fullName) {
    return Response.json({ error: 'Full name is required' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  })

  if (error) {
    return Response.json({ error: 'Failed to update name' }, { status: 500 })
  }

  return Response.json({ success: true, fullName })
}
