import { NextRequest, NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'

function authorize(req: NextRequest) {
  const secret = req.headers.get('x-api-secret')
  const expected = process.env.CRON_SECRET
  return !expected || secret === expected
}

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dateParam = req.nextUrl.searchParams.get('date') || todayToronto()
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if (!saJson) {
    return NextResponse.json({ error: 'Google service account not configured' }, { status: 500 })
  }

  try {
    const credentials = JSON.parse(saJson)
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    })

    const client = await auth.getClient()
    const tokenRes = await client.getAccessToken()
    const token = tokenRes.token

    const timeMin = `${dateParam}T00:00:00-04:00`
    const timeMax = `${dateParam}T23:59:59-04:00`

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('timeMin', timeMin)
    url.searchParams.set('timeMax', timeMax)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Calendar API error: ${res.status}`, details: text }, { status: 500 })
    }

    const data = await res.json()

    const events = (data.items || []).map((e: any) => ({
      summary: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || null,
      description: e.description ? e.description.slice(0, 100) : null,
    }))

    return NextResponse.json({ date: dateParam, events })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
