import { chromium } from 'playwright-core'

const CLUB = 'claremontlawntennisclub'
const CLUB_URL = `https://play.tennis.com.au/${CLUB}`
const SIGN_IN_URL = 'https://play.tennis.com.au/Account/SignIn'
const AUTH_DOMAIN = 'auth-play.tennis.com.au'

/**
 * Launch a headless Chromium browser and authenticate with ClubSpark
 * as administrator. Returns { browser, context, page }.
 * Caller MUST close the browser when done.
 */
export async function launchAuthenticatedBrowser() {
  const username = process.env.CLUBSPARK_USERNAME
  const password = process.env.CLUBSPARK_PASSWORD

  if (!username || !password) {
    throw new Error('Missing CLUBSPARK_USERNAME or CLUBSPARK_PASSWORD environment variables')
  }

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--headless=new'],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  try {
    // Step 1: Navigate to sign-in (WS-Fed redirect)
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })

    const currentUrl = page.url()
    if (currentUrl.includes(AUTH_DOMAIN) || currentUrl.includes('signin')) {
      // Step 2: Fill credentials and submit
      await page.waitForSelector('#EmailAddress', { timeout: 5000 })
      await page.fill('#EmailAddress', username)
      await page.fill('#Password', password)
      await page.click('button[type="submit"]')

      // Wait for SAML redirect to complete
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
    }

    // Step 3: Navigate to club booking page
    await page.goto(`${CLUB_URL}/Booking/BookByDate`, { waitUntil: 'domcontentloaded', timeout: 15000 })

    const finalUrl = page.url()
    if (finalUrl.includes('SignIn') || finalUrl.includes(AUTH_DOMAIN)) {
      throw new Error('Authentication failed — redirected back to login page')
    }

    // Step 4: Switch to Administrator view
    await page.waitForSelector('.resource-wrap', { timeout: 10000 })

    const switchResult = await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      for (const sel of selects) {
        const selectedText = sel.options[sel.selectedIndex]?.textContent || ''
        if (selectedText.includes('Guest') || selectedText.includes('guest')) {
          for (const opt of sel.options) {
            if (opt.textContent.includes('Administrator') || opt.value.includes('administrator')) {
              sel.value = opt.value
              sel.dispatchEvent(new Event('change', { bubbles: true }))
              return { switched: true }
            }
          }
        }
        if (selectedText.includes('Administrator')) {
          return { switched: true, alreadyAdmin: true }
        }
      }
      return { switched: false }
    })

    if (switchResult.switched && !switchResult.alreadyAdmin) {
      // Wait for the grid to re-render in admin mode
      await page.waitForSelector('.resource-wrap', { state: 'attached', timeout: 10000 })
    }

    if (!switchResult.switched) {
      console.warn('[ClubSpark Auth] WARNING: Could not switch to Administrator view')
    }

    return { browser, context, page }

  } catch (error) {
    try { await page.screenshot({ path: '/tmp/clubspark-auth-error.png' }) } catch {}
    await browser.close()
    throw new Error(`ClubSpark authentication failed: ${error.message}`)
  }
}
