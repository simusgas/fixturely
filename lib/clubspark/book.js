import { launchAuthenticatedBrowser } from './auth.js'
import { attachRequestLogger } from './request-logger.js'

const CLUB = 'claremontlawntennisclub'
const BOOKING_BASE = `https://play.tennis.com.au/${CLUB}/Booking/BookByDate`

/**
 * Convert minutes-from-midnight to "HH:MM" string
 */
function minsToTime(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Convert minutes-from-midnight to 12-hour display string
 */
function minsToDisplay(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')}${ampm}`
}

/**
 * Book a court on ClubSpark via Playwright browser automation.
 *
 * @param {Object} params
 * @param {string} params.courtName   - e.g. "Court 13"
 * @param {string} params.resourceId  - ClubSpark Resource GUID (optional, helps target the right column)
 * @param {string} params.date        - YYYY-MM-DD
 * @param {number} params.startMins   - Minutes from midnight (e.g. 600 = 10:00am)
 * @param {number} params.durationMins - Duration in minutes (30, 60, 90, or 120)
 *
 * @returns {{ success: boolean, bookingRef?: string, error?: string, requestLog?: object[] }}
 */
export async function bookCourt({ courtName, resourceId, date, startMins, durationMins }) {
  const endMins = startMins + durationMins
  const startTime = minsToTime(startMins)
  const endTime = minsToTime(endMins)

  console.log(`[ClubSpark Book] Booking ${courtName} on ${date} from ${minsToDisplay(startMins)} to ${minsToDisplay(endMins)} (${durationMins}min)`)

  let browser
  try {
    const auth = await launchAuthenticatedBrowser()
    browser = auth.browser
    const { page } = auth

    // Attach request logger to capture all POST requests for future HTTP replay
    const logger = attachRequestLogger(page)

    // Navigate to the booking page for the target date
    const bookingUrl = `${BOOKING_BASE}#?date=${date}&role=`
    console.log(`[ClubSpark Book] Navigating to booking page: ${bookingUrl}`)
    await page.goto(bookingUrl, { waitUntil: 'networkidle', timeout: 30000 })

    // Wait for the booking grid to load
    // ClubSpark renders a table/grid with court columns and time rows
    await page.waitForTimeout(3000) // Let Angular/JS render

    console.log(`[ClubSpark Book] Page loaded: ${page.url()}`)

    // Strategy: ClubSpark booking pages use different UI patterns.
    // We need to find and click the correct time slot on the correct court.
    //
    // Common approaches (we try multiple):
    // 1. Direct link/cell click on the booking grid
    // 2. JavaScript API call if exposed

    // Try to find the booking grid
    // ClubSpark uses a table where each column is a court and rows are time slots
    // The grid typically has data attributes or identifiable classes

    // Look for clickable time slots — they're usually links or divs with onclick handlers
    // that contain the resource ID and time information

    // Attempt 1: Look for slots by data attributes
    let slotClicked = false

    // Try clicking on a slot that matches our court and time
    // ClubSpark booking sheets typically have cells with data like resource-id and time
    const slotSelectors = [
      // Common ClubSpark booking sheet patterns
      `[data-resource-id="${resourceId}"][data-time="${startTime}"]`,
      `[data-resourceid="${resourceId}"][data-start="${startMins}"]`,
      `a[href*="resourceId=${resourceId}"][href*="startTime=${startTime}"]`,
      // Try by court name and time in the visible grid
      `td[data-time="${startTime}"] a`,
    ]

    for (const sel of slotSelectors) {
      try {
        const el = await page.$(sel)
        if (el) {
          console.log(`[ClubSpark Book] Found slot with selector: ${sel}`)
          await el.click()
          slotClicked = true
          break
        }
      } catch {}
    }

    if (!slotClicked) {
      // Attempt 2: Find the slot by visual position
      // Get all court header cells to find column index, then click the matching time row
      console.log('[ClubSpark Book] Trying visual slot detection...')

      // Log the page structure for debugging
      const pageContent = await page.content()
      const bodySnippet = pageContent.slice(0, 5000)
      console.log('[ClubSpark Book] Page body preview:', bodySnippet.slice(0, 2000))

      // Try to find any clickable booking element
      const allLinks = await page.$$('a[href*="Booking"], .booking-slot, .available-slot, .slot-available, [class*="book"], [class*="slot"]')
      console.log(`[ClubSpark Book] Found ${allLinks.length} potential booking elements`)

      if (allLinks.length > 0) {
        // Log what we found for debugging
        for (let i = 0; i < Math.min(allLinks.length, 5); i++) {
          const href = await allLinks[i].getAttribute('href')
          const cls = await allLinks[i].getAttribute('class')
          const text = await allLinks[i].textContent()
          console.log(`[ClubSpark Book]   Element ${i}: class="${cls}" href="${href}" text="${text?.slice(0, 50)}"`)
        }
      }

      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/clubspark-booking-grid.png', fullPage: true })
      console.log('[ClubSpark Book] Screenshot saved to /tmp/clubspark-booking-grid.png')

      // Print the captured requests so far
      logger.printSummary()

      return {
        success: false,
        error: 'Could not find the booking slot on the page. Check /tmp/clubspark-booking-grid.png for the page state.',
        requestLog: logger.getCaptured(),
      }
    }

    // Wait for the booking overlay/dialog to appear
    console.log('[ClubSpark Book] Waiting for booking dialog...')
    await page.waitForTimeout(2000)

    // Look for duration selection if the dialog has one
    // ClubSpark booking dialogs typically let you choose duration
    const durationSelectors = [
      `select[name*="duration"], select[name*="Duration"]`,
      `[data-duration="${durationMins}"]`,
      `option[value="${durationMins}"]`,
    ]

    for (const sel of durationSelectors) {
      try {
        const el = await page.$(sel)
        if (el) {
          console.log(`[ClubSpark Book] Found duration selector: ${sel}`)
          if (sel.startsWith('select')) {
            await page.selectOption(sel, String(durationMins))
          } else {
            await el.click()
          }
          break
        }
      } catch {}
    }

    // Look for "Continue" or "Confirm" button
    const confirmSelectors = [
      'button:has-text("Continue")',
      'button:has-text("Confirm")',
      'button:has-text("Book")',
      'input[type="submit"][value*="Continue"]',
      'input[type="submit"][value*="Confirm"]',
      'input[type="submit"][value*="Book"]',
      '.btn-primary:has-text("Continue")',
      '.btn-primary:has-text("Book")',
    ]

    let confirmed = false
    for (const sel of confirmSelectors) {
      try {
        const el = await page.$(sel)
        if (el && await el.isVisible()) {
          console.log(`[ClubSpark Book] Clicking confirm button: ${sel}`)
          await el.click()
          confirmed = true
          break
        }
      } catch {}
    }

    if (!confirmed) {
      await page.screenshot({ path: '/tmp/clubspark-booking-dialog.png' })
      console.log('[ClubSpark Book] Screenshot saved to /tmp/clubspark-booking-dialog.png')
      logger.printSummary()

      return {
        success: false,
        error: 'Could not find confirm/continue button after selecting slot. Check /tmp/clubspark-booking-dialog.png',
        requestLog: logger.getCaptured(),
      }
    }

    // Wait for booking confirmation
    await page.waitForTimeout(3000)

    // Check if we landed on a confirmation page
    const finalUrl = page.url()
    const finalContent = await page.textContent('body')
    console.log(`[ClubSpark Book] Final URL: ${finalUrl}`)

    // Look for confirmation indicators
    const isConfirmed =
      finalContent.includes('confirmed') ||
      finalContent.includes('Confirmed') ||
      finalContent.includes('booked') ||
      finalContent.includes('Booked') ||
      finalContent.includes('success') ||
      finalContent.includes('Thank you')

    // Try to extract a booking reference
    let bookingRef = null
    const refMatch = finalContent.match(/(?:booking|reference|ref|confirmation)\s*(?:#|:)?\s*([A-Z0-9-]+)/i)
    if (refMatch) bookingRef = refMatch[1]

    // Take final screenshot
    await page.screenshot({ path: '/tmp/clubspark-booking-result.png' })

    // Print request log
    logger.printSummary()

    if (isConfirmed) {
      console.log(`[ClubSpark Book] Booking confirmed! Ref: ${bookingRef || 'none'}`)
      return {
        success: true,
        bookingRef,
        requestLog: logger.getCaptured(),
      }
    }

    // Not clearly confirmed — might need additional steps (payment page, etc.)
    // For admin accounts, bookings should be free and auto-confirmed
    console.log('[ClubSpark Book] Booking result unclear. Check /tmp/clubspark-booking-result.png')
    return {
      success: false,
      error: 'Booking submitted but confirmation not detected. The booking may have succeeded — check ClubSpark directly.',
      bookingRef,
      requestLog: logger.getCaptured(),
    }

  } catch (error) {
    console.error(`[ClubSpark Book] Error: ${error.message}`)
    return {
      success: false,
      error: error.message,
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
