import { launchAuthenticatedBrowser } from './auth.js'
import { attachRequestLogger } from './request-logger.js'

const CLUB = 'claremontlawntennisclub'
const BOOKING_BASE = `https://play.tennis.com.au/${CLUB}/Booking/BookByDate`
const BOOKING_EDIT = `https://play.tennis.com.au/${CLUB}/booking/edit`

// ClubSpark category codes (discovered from URL params)
const CATEGORY_COACHING = 2000
const SUBCATEGORY_ADULT = 2010

function minsToTime(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

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
 * Uses the advanced booking page directly for speed and to set the coach name.
 * Flow:
 *   1. Auth + switch to admin
 *   2. Verify slot is available on the booking grid
 *   3. Navigate directly to the advanced booking edit page with pre-filled params
 *   4. Set Name, end time, resource, contact
 *   5. Submit
 *
 * @param {Object} params
 * @param {string} params.courtName    - e.g. "Court 13"
 * @param {string} params.resourceId   - ClubSpark Resource GUID
 * @param {string} params.date         - YYYY-MM-DD
 * @param {number} params.startMins    - Minutes from midnight (e.g. 600 = 10:00am)
 * @param {number} params.durationMins - Duration in minutes (30, 60, 90, or 120)
 * @param {string} params.coachName    - Coach's display name for the booking
 *
 * @returns {{ success: boolean, bookingRef?: string, error?: string, requestLog?: object[] }}
 */
export async function bookCourt({ courtName, resourceId, date, startMins, durationMins, coachName }) {
  const endMins = startMins + durationMins
  const startTime = minsToTime(startMins)
  const endTime = minsToTime(endMins)

  console.log(`[ClubSpark Book] ${courtName} ${date} ${minsToDisplay(startMins)}-${minsToDisplay(endMins)} for ${coachName}`)

  let browser
  try {
    const auth = await launchAuthenticatedBrowser()
    browser = auth.browser
    const { page } = auth

    const logger = attachRequestLogger(page)

    // ── Step 1: Check slot availability on the booking grid ──
    const bookingUrl = `${BOOKING_BASE}#?date=${date}&role=administrator`
    await page.goto(bookingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForSelector('.resource-wrap', { timeout: 10000 })

    // Dismiss cookie banner without waiting
    page.$('button:has-text("Accept All")').then(btn => btn?.click()).catch(() => {})

    // Resolve resource ID if not provided
    let resolvedResourceId = resourceId
    if (!resolvedResourceId) {
      resolvedResourceId = await page.evaluate((name) => {
        return document.querySelector(`.resource[data-resource-name="${name}"]`)?.getAttribute('data-resource-id') || ''
      }, courtName)
    }

    // Verify the slot is actually available
    const slotAvailable = await page.evaluate(({ rid, date, startMins, courtName }) => {
      const selectors = [
        rid && `a.book-interval.not-booked[data-test-id="booking-${rid}|${date}|${startMins}"]`,
        `.resource[data-resource-name="${courtName}"] .resource-interval[data-system-start-time="${startMins}"] a.book-interval.not-booked`,
      ].filter(Boolean)
      for (const sel of selectors) {
        if (document.querySelector(sel)) return true
      }
      return false
    }, { rid: resolvedResourceId, date, startMins, courtName })

    if (!slotAvailable) {
      await page.screenshot({ path: '/tmp/clubspark-booking-grid.png', fullPage: true })
      return {
        success: false,
        error: `Could not find available slot for ${courtName} at ${minsToDisplay(startMins)} on ${date}. The slot may already be booked.`,
        requestLog: logger.getCaptured(),
      }
    }

    // Also look up the resource group ID (needed for the Where field)
    const resourceGroupId = await page.evaluate((rid) => {
      const el = document.querySelector(`.resource[data-resource-id="${rid}"]`)
      return el?.getAttribute('data-resource-group-id') || ''
    }, resolvedResourceId)

    // ── Step 2: Navigate directly to the advanced booking page ──
    // This skips the simple modal entirely — faster and gives us the Name field
    const editUrl = `${BOOKING_EDIT}?category=${CATEGORY_COACHING}&subCategory=${SUBCATEGORY_ADULT}&startDate=${date}&startTime=${startMins}&endTime=${endMins}&resourceId=${resolvedResourceId}&resourceGroupId=${resourceGroupId}`
    console.log(`[ClubSpark Book] Navigating to advanced booking page`)
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Wait for the form to load
    await page.waitForSelector('#Name', { timeout: 8000 })

    // ── Step 3: Fill in the form fields ──
    const fillResult = await page.evaluate(({ coachName, endTime, resolvedResourceId }) => {
      const results = {}

      // Name field — clear default and set coach name
      const nameInput = document.querySelector('#Name')
      if (nameInput) {
        nameInput.value = coachName
        nameInput.dispatchEvent(new Event('input', { bubbles: true }))
        nameInput.dispatchEvent(new Event('change', { bubbles: true }))
        results.name = coachName
      }

      // End time — fix it (may show wrong default)
      const endTimeSelect = document.querySelector('#EndTime')
      if (endTimeSelect) {
        for (const opt of endTimeSelect.options) {
          if (opt.value === endTime) {
            endTimeSelect.value = endTime
            endTimeSelect.dispatchEvent(new Event('change', { bubbles: true }))
            results.endTime = endTime
            break
          }
        }
      }

      // Where / Resource — select the correct court
      const resourceSelect = document.querySelector('#Resources')
      if (resourceSelect && resolvedResourceId) {
        for (const opt of resourceSelect.options) {
          if (opt.value.includes(resolvedResourceId)) {
            resourceSelect.value = opt.value
            resourceSelect.dispatchEvent(new Event('change', { bubbles: true }))
            results.resource = opt.textContent.trim()
            break
          }
        }
      }

      // Click "Me" for contact
      const allLinks = document.querySelectorAll('a')
      for (const link of allLinks) {
        if (link.textContent.trim() === 'Me' && link.offsetParent !== null) {
          link.click()
          results.contact = true
          break
        }
      }

      return results
    }, { coachName, endTime, resolvedResourceId })

    console.log('[ClubSpark Book] Form filled:', JSON.stringify(fillResult))

    // Brief pause for contact "Me" to populate
    await page.waitForTimeout(500)

    // ── Step 4: Submit the form ──
    const submitBtn = await page.$('button:has-text("Continue booking"), button:has-text("Continue"), button[type="submit"], input[type="submit"]')
    if (!submitBtn || !(await submitBtn.isVisible())) {
      await page.screenshot({ path: '/tmp/clubspark-booking-filled.png' })
      return {
        success: false,
        error: 'Could not find submit button on advanced booking page.',
        requestLog: logger.getCaptured(),
      }
    }

    await Promise.all([
      submitBtn.click(),
      Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
        page.waitForSelector('.text-danger, .validation-summary-errors, button:has-text("Confirm")', { timeout: 10000 }).catch(() => {}),
      ]),
    ])

    // Check for validation errors
    const validationError = await page.evaluate(() => {
      const errorEls = document.querySelectorAll('.text-danger, .validation-summary-errors, .field-validation-error, [class*="alert-danger"]')
      for (const el of errorEls) {
        const text = el.textContent?.trim()
        if (text && text.length > 3 && text.length < 200) return text
      }
      return null
    })

    if (validationError) {
      await page.screenshot({ path: '/tmp/clubspark-booking-result.png' })
      return {
        success: false,
        error: `ClubSpark validation error: ${validationError}`,
        requestLog: logger.getCaptured(),
      }
    }

    // ── Step 5: Handle confirmation step ──
    const confirmBtn = await page.$('button:has-text("Confirm"), button:has-text("Complete"), input[type="submit"][value*="Confirm"]')
    if (confirmBtn && await confirmBtn.isVisible().catch(() => false)) {
      await Promise.all([
        confirmBtn.click(),
        Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
          page.waitForTimeout(3000),
        ]),
      ])
    }

    // ── Step 6: Verify booking succeeded ──
    const finalUrl = page.url()
    const finalContent = await page.textContent('body')

    const confirmationPhrases = [
      'Your booking has been confirmed',
      'Booking confirmed',
      'Booking complete',
      'booking has been made',
      'successfully booked',
      'Thank you',
    ]
    const isConfirmed = confirmationPhrases.some(phrase => finalContent.includes(phrase))

    let bookingRef = null
    const refMatch = finalContent.match(/(?:booking|reference|ref|confirmation)\s*(?:#|:)?\s*([A-Z0-9-]+)/i)
    if (refMatch) bookingRef = refMatch[1]
    if (!bookingRef) {
      const urlMatch = finalUrl.match(/(?:booking|session|id)[=/]([a-f0-9-]+)/i)
      if (urlMatch) bookingRef = urlMatch[1]
    }

    if (isConfirmed) {
      return { success: true, bookingRef, requestLog: logger.getCaptured() }
    }

    // Check if a booking-specific POST succeeded
    const bookingPosts = logger.getCaptured().filter(r => {
      const url = r.url || ''
      return (
        r.responseStatus >= 200 && r.responseStatus < 300 &&
        (url.includes('/Booking/') || url.includes('/Book') || url.includes('/booking/') || url.includes('CreateBooking') || url.includes('SaveBooking'))
      )
    })
    if (bookingPosts.length > 0) {
      return { success: true, bookingRef: bookingRef || 'post-confirmed', requestLog: logger.getCaptured() }
    }

    await page.screenshot({ path: '/tmp/clubspark-booking-result.png' })
    return {
      success: false,
      error: 'Booking submitted but confirmation not detected. Check ClubSpark directly.',
      bookingRef,
      requestLog: logger.getCaptured(),
    }

  } catch (error) {
    console.error(`[ClubSpark Book] Error: ${error.message}`)
    return { success: false, error: error.message }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
