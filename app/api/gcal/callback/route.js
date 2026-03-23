import { createClient } from '@/lib/supabase/server'
import { getTokensFromCode } from '@/lib/google/calendar'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // coach user ID

  if (!code) {
    return NextResponse.redirect(new URL('/fixturely-app.html?gcal=error&reason=no_code', request.url))
  }

  try {
    const tokens = await getTokensFromCode(code)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.redirect(new URL('/fixturely-app.html?gcal=error&reason=not_auth', request.url))
    }

    // Upsert tokens (replace if exists)
    const { error: dbError } = await supabase
      .from('google_tokens')
      .upsert({
        coach_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'coach_id' })

    if (dbError) {
      console.error('[GCal Callback] DB error:', dbError)
      return NextResponse.redirect(new URL('/fixturely-app.html?gcal=error&reason=db', request.url))
    }

    return NextResponse.redirect(new URL('/fixturely-app.html?gcal=connected#schedule', request.url))
  } catch (err) {
    console.error('[GCal Callback] Token exchange error:', err)
    return NextResponse.redirect(new URL('/fixturely-app.html?gcal=error&reason=token', request.url))
  }
}
