import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/google/calendar'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'Google Calendar not configured' }, { status: 500 })
  }

  const url = getAuthUrl(user.id)
  return Response.json({ url })
}
