import { chromium } from 'playwright-core';

const browser = await chromium.launch({ 
  headless: true, channel: 'chrome',
  args: ['--no-sandbox', '--disable-gpu', '--headless=new']
});
const page = await browser.newPage();

await page.goto('https://play.tennis.com.au/Account/SignIn', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.fill('#EmailAddress', process.env.CLUBSPARK_USERNAME);
await page.fill('#Password', process.env.CLUBSPARK_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });

await page.goto('https://play.tennis.com.au/claremontlawntennisclub/Booking/BookByDate', { 
  waitUntil: 'domcontentloaded', timeout: 30000 
});
await page.waitForTimeout(4000);

// Get the detailed structure of a resource-wrap (court column)
const courtStructure = await page.evaluate(() => {
  const wraps = document.querySelectorAll('.resource-wrap');
  const result = { courtCount: wraps.length, courts: [] };
  
  // Get first 2 courts with their available intervals
  for (let i = 0; i < Math.min(2, wraps.length); i++) {
    const wrap = wraps[i];
    const header = wrap.querySelector('.resource-header');
    const courtName = header?.textContent?.trim()?.split('\n')[0]?.trim();
    
    // Get the resource-session elements (these contain the bookable intervals)
    const sessions = wrap.querySelectorAll('.resource-session');
    const intervals = wrap.querySelectorAll('.resource-interval');
    
    const court = {
      name: courtName,
      wrapHTML: wrap.outerHTML.slice(0, 500),
      sessionCount: sessions.length,
      intervalCount: intervals.length,
    };
    
    // Get detail of first few intervals
    if (intervals.length > 0) {
      court.intervalExamples = [...intervals].slice(0, 3).map(int => ({
        html: int.outerHTML.slice(0, 400),
        text: int.textContent?.trim()?.slice(0, 50),
        class: int.className,
        dataAttrs: Object.fromEntries([...int.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
        parent: int.parentElement?.className?.slice(0, 60),
        isClickable: int.querySelector('a') !== null || int.onclick !== null,
        linkHref: int.querySelector('a')?.href?.slice(0, 150),
      }));
    }
    
    // Get first session (booked block)
    if (sessions.length > 0) {
      court.sessionExamples = [...sessions].slice(0, 2).map(s => ({
        html: s.outerHTML.slice(0, 400),
        text: s.textContent?.trim()?.slice(0, 80),
        class: s.className,
        dataAttrs: Object.fromEntries([...s.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
      }));
    }
    
    result.courts.push(court);
  }
  
  return result;
});

console.log('Courts:', courtStructure.courtCount);
console.log(JSON.stringify(courtStructure, null, 2));

await browser.close();
