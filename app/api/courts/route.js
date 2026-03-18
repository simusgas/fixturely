export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const url = `https://play.tennis.com.au/v0/VenueBooking/claremontlawntennisclub/GetVenueSessions?resourceID=&startDate=${date}&endDate=${date}&roleId=`
  const res = await fetch(url)
  const data = await res.json()
  return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
