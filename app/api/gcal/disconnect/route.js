import { createClient } from '@/lib/supabase/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { error } = await supabase
    .from('google_tokens')
    .delete()
    .eq('coach_id', user.id)

  if (error) {
    console.error('[GCal Disconnect] DB error:', error)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return Response.json({ success: true })
}
