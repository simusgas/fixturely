import { chromium } from 'playwright-core'

const CLUB_URL = 'https://play.tennis.com.au/claremontlawntennisclub'
const SIGN_IN_URL = 'https://play.tennis.com.au/Account/SignIn'
const AUTH_DOMAIN = 'auth-play.tennis.com.au'

/**
 * Launch a headless Chromium browser and authenticate with ClubSpark
 * using the admin credentials from environment variables.
 *
 * Returns { browser, context, page } with an authenticated session.
 * Caller MUST close the browser when done (use try/finally).
 */
export async function launchAuthenticatedBrowser() {
  const username = process.env.CLUBSPARK_USERNAME
  const password = process.env.CLUBSPARK_PASSWORD

  if (!username || !password) {
    throw new Error('Missing CLUBSPARK_USERNAME or CLUBSPARK_PASSWORD environment variables')
  }

  // Find the Playwright-managed Chromium binary, or fall back to system path
  let executablePath
  try {
    // playwright-core doesn't bundle browsers — check for installed Chromium
    const { executablePath: pw } = await import('playwright-core')
    executablePath = undefined // let Playwright find it from the registry
  } catch {
    executablePath = undefined
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  try {
    // Step 1: Navigate to sign-in — this redirects through the WS-Fed flow
    console.log('[ClubSpark Auth] Navigating to sign-in page...')
    await page.goto(SIGN_IN_URL, { waitUntil: 'networkidle', timeout: 30000 })

    // Step 2: We should now be on the auth-play.tennis.com.au login form
    const currentUrl = page.url()
    console.log(`[ClubSpark Auth] Landed on: ${currentUrl}`)

    if (!currentUrl.includes(AUTH_DOMAIN) && !currentUrl.includes('SignIn')) {
      // Might already be logged in (cached session)
      if (currentUrl.includes('play.tennis.com.au') && !currentUrl.includes('SignIn')) {
        console.log('[ClubSpark Auth] Already authenticated (cached session)')
        return { browser, context, page }
      }
      throw new Error(`Unexpected URL after sign-in redirect: ${currentUrl}`)
    }

    // Step 3: Fill in credentials
    console.log('[ClubSpark Auth] Filling in credentials...')

    // The login form may have various selectors depending on the exact page
    // Try common patterns for the email/password fields
    const emailSelector = 'input[name="EmailAddress"], input[name="Email"], input[type="email"], #EmailAddress'
    const passwordSelector = 'input[name="Password"], input[type="password"], #Password'

    await page.waitForSelector(emailSelector, { timeout: 10000 })
    await page.fill(emailSelector, username)
    await page.fill(passwordSelector, password)

    // Step 4: Submit the form
    console.log('[ClubSpark Auth] Submitting login form...')
    const submitSelector = 'button[type="submit"], input[type="submit"], .btn-primary'
    await page.click(submitSelector)

    // Step 5: Wait for the WS-Fed redirect dance to complete
    // After login, the STS returns a SAML token via auto-submit form,
    // which POSTs back to play.tennis.com.au setting the FedAuth cookies
    await page.waitForURL(url => {
      const href = url.toString()
      return href.includes('play.tennis.com.au') && !href.includes('SignIn') && !href.includes(AUTH_DOMAIN)
    }, { timeout: 20000 })

    console.log(`[ClubSpark Auth] Authenticated! Now at: ${page.url()}`)
    return { browser, context, page }

  } catch (error) {
    // Take a screenshot for debugging before closing
    try {
      await page.screenshot({ path: '/tmp/clubspark-auth-error.png' })
      console.error('[ClubSpark Auth] Screenshot saved to /tmp/clubspark-auth-error.png')
    } catch {}

    await browser.close()
    throw new Error(`ClubSpark authentication failed: ${error.message}`)
  }
}
