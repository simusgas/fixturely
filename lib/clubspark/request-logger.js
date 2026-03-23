/**
 * Network request logger for ClubSpark booking flow.
 * Captures all POST requests to play.tennis.com.au during a Playwright session
 * so we can later replicate them as direct HTTP calls (no browser needed).
 */

export function attachRequestLogger(page) {
  const captured = []

  page.on('request', request => {
    if (request.method() !== 'POST') return
    const url = request.url()
    if (!url.includes('play.tennis.com.au') && !url.includes('auth-play.tennis.com.au')) return

    captured.push({
      timestamp: new Date().toISOString(),
      url,
      method: request.method(),
      headers: request.headers(),
      postData: request.postData(),
    })
  })

  page.on('response', async response => {
    const url = response.url()
    if (!url.includes('play.tennis.com.au') && !url.includes('auth-play.tennis.com.au')) return

    const entry = captured.find(c => c.url === url && !c.responseStatus)
    if (!entry) return

    entry.responseStatus = response.status()
    entry.responseHeaders = response.headers()

    try {
      const contentType = response.headers()['content-type'] || ''
      if (contentType.includes('json')) {
        entry.responseBody = await response.json()
      } else if (contentType.includes('text') || contentType.includes('html')) {
        const text = await response.text()
        // Only capture first 2000 chars of HTML to avoid huge logs
        entry.responseBody = text.length > 2000 ? text.slice(0, 2000) + '...[truncated]' : text
      }
    } catch {
      // Response body may not be available (e.g. redirects)
    }
  })

  return {
    getCaptured: () => captured,
    printSummary: () => {
      console.log('\n═══ ClubSpark Request Log ═══')
      console.log(`Captured ${captured.length} POST requests:\n`)
      for (const req of captured) {
        console.log(`  ${req.method} ${req.url}`)
        console.log(`    Status: ${req.responseStatus || 'pending'}`)
        if (req.postData) {
          const preview = req.postData.length > 200
            ? req.postData.slice(0, 200) + '...'
            : req.postData
          console.log(`    Body: ${preview}`)
        }
        console.log()
      }
      console.log('═══ End Request Log ═══\n')
    },
    toJSON: () => JSON.stringify(captured, null, 2),
  }
}
