import { google } from 'googleapis'

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(state) {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state,
  })
}

export async function getTokensFromCode(code) {
  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code)
  return tokens
}

export async function getCalendarClient(tokens, supabase, coachId) {
  const client = getOAuth2Client()
  client.setCredentials(tokens)

  // Check if token needs refresh
  if (tokens.expiry_date && tokens.expiry_date < Date.now() && tokens.refresh_token) {
    const { credentials } = await client.refreshAccessToken()
    // Update stored tokens
    await supabase
      .from('google_tokens')
      .update({
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
        updated_at: new Date().toISOString(),
      })
      .eq('coach_id', coachId)
    client.setCredentials(credentials)
  }

  return google.calendar({ version: 'v3', auth: client })
}
