'use client'

import { useState, useEffect, useCallback, useMemo, use } from 'react'

const P = '#4F46E5', P2 = '#7C3AED', P_DK = '#3730A3'
const TEXT = '#0F172A', SOFT = '#475569', MUTED = '#94A3B8', BORDER = '#E7E9F2', OFF = '#F7F8FC'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DUR_LBL = { '30m': '30 min', '45m': '45 min', '1h': '1 hour' }
const DUR_MIN = { '30m': 30, '45m': 45, '1h': 60 }

function fmt(t) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function initialsOf(name) {
  return (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '🎾'
}
// Group a day's slots into Morning / Afternoon / Evening for a scannable layout
function partOfDay(t) {
  const h = +t.split(':')[0]
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}
const PART_META = {
  Morning: { icon: '🌅', order: 0 },
  Afternoon: { icon: '☀️', order: 1 },
  Evening: { icon: '🌆', order: 2 },
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap');
.fx * { box-sizing: border-box; }
.fx { font-family: 'Inter', -apple-system, system-ui, sans-serif; }
.fx-display { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; }
@keyframes fxMesh { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5%,4%) scale(1.12)} 100%{transform:translate(0,0) scale(1)} }
@keyframes fxMesh2 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(6%,-3%) scale(1.1)} 100%{transform:translate(0,0) scale(1)} }
@keyframes fxUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes fxSheet { from{transform:translateY(100%)} to{transform:translateY(0)} }
@keyframes fxFade { from{opacity:0} to{opacity:1} }
@keyframes fxFloat { 0%,100%{transform:translateY(0) rotate(-6deg)} 50%{transform:translateY(-7px) rotate(6deg)} }
@keyframes fxShimmer { 0%{background-position:-500px 0} 100%{background-position:500px 0} }
@keyframes fxPop { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
.fx-up { animation: fxUp .5s cubic-bezier(.22,1,.36,1) both; }
.fx-slot { transition: transform .16s cubic-bezier(.22,1,.36,1), box-shadow .16s, border-color .16s; }
.fx-slot:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(79,70,229,.13); border-color: #C7CBF5; }
.fx-slot:active { transform: translateY(0) scale(.99); }
.fx-daypill { transition: transform .16s, box-shadow .16s, border-color .16s, background .16s; }
.fx-daypill:hover:not(.is-off) { transform: translateY(-2px); }
.fx-cta { transition: transform .14s, box-shadow .2s, filter .2s; }
.fx-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(79,70,229,.4); filter: saturate(1.1); }
.fx-cta:active:not(:disabled) { transform: translateY(0) scale(.99); }
.fx-ghost { transition: background .15s, border-color .15s, transform .12s; }
.fx-ghost:hover { background: #F2F1FC; border-color: #C7CBF5; }
.fx-ghost:active { transform: scale(.98); }
.fx-icon-btn { transition: background .15s, transform .12s; }
.fx-icon-btn:hover { background: rgba(255,255,255,.28); }
.fx-icon-btn:active { transform: scale(.94); }
.fx-skel { background: linear-gradient(90deg,#EDEFF6 25%,#F6F7FB 50%,#EDEFF6 75%); background-size: 500px 100%; animation: fxShimmer 1.3s infinite linear; border-radius: 14px; }
.fx-input { transition: border-color .15s, box-shadow .15s, background .15s; }
.fx-input:focus { border-color: ${P}; background: #fff; box-shadow: 0 0 0 4px rgba(79,70,229,.12); }
.fx-link { transition: color .15s; }
.fx-link:hover { color: ${P_DK}; }
`

export default function CoachPage({ params }) {
  const { name } = use(params)
  // Which schedule this link shares (Current / Next Term / Holidays); default main
  const cal = (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('cal') : '') || 'main'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [coachName, setCoachName] = useState('')
  const [coachId, setCoachId] = useState('')
  const [days, setDays] = useState([])
  const [selDate, setSelDate] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [selSlot, setSelSlot] = useState(null)
  const [selDur, setSelDur] = useState('1h')
  const [selRecur, setSelRecur] = useState(null)
  const [reqName, setReqName] = useState('')
  const [reqContact, setReqContact] = useState('')
  const [reqMsg, setReqMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [shareNote, setShareNote] = useState('')

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
  const nowM = now.getHours() * 60 + now.getMinutes()
  const isPast = useCallback((dateStr, time) => {
    if (dateStr < todayStr) return true
    if (dateStr > todayStr) return false
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m <= nowM
  }, [todayStr, nowM])

  const load = useCallback(() => {
    return fetch(`/api/coach-public?slug=${encodeURIComponent(name)}&cal=${encodeURIComponent(cal)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setCoachName(d.coachName)
        setCoachId(d.coachId)
        const loaded = d.days || []
        setDays(loaded)
        setSelDate(prev => prev || loaded.find(day => day.slots.some(s => !isPast(day.date, s.time)))?.date || null)
        setLoading(false)
      })
      .catch(() => { setError('load-failed'); setLoading(false) })
  }, [name, cal, isPast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showForm])

  useEffect(() => {
    const onMsg = e => { if (e.data === 'fixturely-availability-changed') load() }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [load])

  // Live stats: openings across the next 7 days, and the soonest available slot
  const stats = useMemo(() => {
    let openings = 0, soonest = null
    for (const day of days) {
      for (const s of day.slots) {
        if (isPast(day.date, s.time)) continue
        openings++
        if (!soonest) soonest = { date: day.date, time: s.time }
      }
    }
    return { openings, soonest }
  }, [days, isPast])

  function openRequest(slot) {
    setSelSlot(slot)
    setSelDur(slot.durs.includes('1h') ? '1h' : slot.durs[slot.durs.length - 1])
    setSelRecur(null)
    setReqName('')
    setReqContact('')
    setReqMsg('')
    setSubmitted(false)
    setShowForm(true)
  }

  async function submitRequest() {
    if (!reqName.trim() || !reqContact.trim() || !selRecur) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId, studentName: reqName.trim(), contact: reqContact.trim(),
          message: reqMsg.trim(), date: selDate, time: selSlot.time, dur: selDur, recur: selRecur, calendar: cal,
        }),
      })
      const d = await r.json()
      if (d.success) { setSubmitted(true); load() }
    } catch (e) { /* ignore */ }
    setSubmitting(false)
  }

  async function shareCoach() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const shareData = { title: `Book a lesson with ${coachName}`, text: `Book a tennis lesson with ${coachName}`, url }
    try {
      if (navigator.share) { await navigator.share(shareData); return }
      await navigator.clipboard.writeText(url)
      setShareNote('Link copied!')
      setTimeout(() => setShareNote(''), 1800)
    } catch (e) { /* user dismissed */ }
  }

  // Calendar helpers for the confirmation screen (tentative hold — pending coach OK)
  function calTimes() {
    const [h, m] = selSlot.time.split(':').map(Number)
    const start = new Date(selDate + 'T00:00:00'); start.setHours(h, m, 0, 0)
    const end = new Date(start.getTime() + DUR_MIN[selDur] * 60000)
    const stamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
    return { start, end, s: stamp(start), e: stamp(end) }
  }
  function addToGoogle() {
    const { s, e } = calTimes()
    const title = encodeURIComponent(`Tennis lesson with ${coachName}`)
    const details = encodeURIComponent('Requested via Fixturely — pending confirmation from your coach.')
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${s}/${e}&details=${details}`, '_blank')
  }
  function addToIcs() {
    const { s, e } = calTimes()
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fixturely//EN', 'BEGIN:VEVENT',
      `DTSTART:${s}`, `DTEND:${e}`, `SUMMARY:Tennis lesson with ${coachName}`,
      'DESCRIPTION:Requested via Fixturely — pending confirmation.', 'STATUS:TENTATIVE', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const a = document.createElement('a')
    a.href = 'data:text/calendar;charset=utf8,' + encodeURIComponent(ics)
    a.download = 'lesson.ics'; a.click()
  }

  // ── Loading skeleton ──
  if (loading) return (
    <div className="fx" style={{ minHeight: '100vh', background: OFF }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ height: 220, background: `linear-gradient(150deg, ${P_DK}, ${P} 55%, ${P2})` }} />
      <div style={{ maxWidth: 500, margin: '-56px auto 0', padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(30,27,75,.14)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="fx-skel" style={{ width: 54, height: 68, flexShrink: 0 }} />)}
          </div>
          {[0, 1, 2].map(i => <div key={i} className="fx-skel" style={{ height: 66, marginBottom: 10 }} />)}
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="fx" style={{ minHeight: '100vh', background: OFF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ textAlign: 'center', color: SOFT, padding: 28 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🎾</div>
        <div className="fx-display" style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 6 }}>
          {error === 'Coach not found' ? 'Coach not found' : 'Something went wrong'}
        </div>
        <div style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>
          {error === 'Coach not found' ? "This booking page doesn't exist." : 'Please try again in a moment.'}
        </div>
        <a href="/" className="fx-cta" style={{ display: 'inline-block', textDecoration: 'none', background: `linear-gradient(135deg, ${P}, ${P2})`, color: '#fff', padding: '12px 24px', borderRadius: 100, fontSize: 14, fontWeight: 800 }}>
          Create your own booking page →
        </a>
      </div>
    </div>
  )

  const selDay = days.find(d => d.date === selDate)
  const daySlots = selDay ? selDay.slots.filter(s => !isPast(selDay.date, s.time)) : []
  const grouped = ['Morning', 'Afternoon', 'Evening']
    .map(part => ({ part, slots: daySlots.filter(s => partOfDay(s.time) === part) }))
    .filter(g => g.slots.length)

  return (
    <div className="fx" style={{ minHeight: '100vh', background: OFF }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(150deg, ${P_DK}, ${P} 55%, ${P2})`, padding: '20px 20px 84px' }}>
        <div style={{ position: 'absolute', top: '-35%', left: '-12%', width: '70%', height: '170%', background: 'radial-gradient(circle, rgba(190,242,100,.4), transparent 60%)', filter: 'blur(34px)', animation: 'fxMesh 14s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-45%', right: '-18%', width: '80%', height: '170%', background: 'radial-gradient(circle, rgba(167,139,250,.6), transparent 60%)', filter: 'blur(34px)', animation: 'fxMesh2 17s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 72% 18%, rgba(255,255,255,.16), transparent 42%)' }} />

        <div style={{ position: 'relative', maxWidth: 500, margin: '0 auto' }}>
          {/* Top row: brand + share */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 800, letterSpacing: .3 }}>
              <span style={{ display: 'inline-flex', animation: 'fxFloat 3.2s ease-in-out infinite' }}>🎾</span> Fixturely
            </div>
            <button onClick={shareCoach} className="fx-icon-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', padding: '7px 14px', borderRadius: 100, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(6px)' }}>
              {shareNote || '↗ Share'}
            </button>
          </div>

          {/* Avatar + name */}
          <div style={{ textAlign: 'center' }} className="fx-up">
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.4)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
              <span className="fx-display" style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: .5 }}>{initialsOf(coachName)}</span>
            </div>
            <div className="fx-display" style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: -.5, lineHeight: 1.1 }}>{coachName}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.82)', marginTop: 5 }}>Tennis Coach</div>

            {/* Trust chips */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
              {stats.openings > 0 && (
                <div style={chip}><b style={{ color: '#EAFFB0' }}>{stats.openings}</b>&nbsp;openings this fortnight</div>
              )}
              <div style={chip}>⚡ Usually replies fast</div>
              <div style={chip}>✅ Book in seconds</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Booking card (overlaps hero) ── */}
      <div style={{ maxWidth: 500, margin: '-64px auto 0', padding: '0 16px 40px', position: 'relative' }}>
        <div className="fx-up" style={{ background: '#fff', borderRadius: 24, padding: '20px 18px 22px', boxShadow: '0 24px 60px rgba(30,27,75,.16)', border: '1px solid rgba(255,255,255,.7)' }}>
          <div className="fx-display" style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Pick a time</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 16 }}>Request a lesson — your coach confirms it</div>

          {/* Day strip */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 18, WebkitOverflowScrolling: 'touch' }}>
            {days.map(day => {
              const d = new Date(day.date + 'T00:00:00')
              const openCount = day.slots.filter(s => !isPast(day.date, s.time)).length
              const hasSlots = openCount > 0
              const isActive = day.date === selDate
              const isToday = day.date === todayStr
              return (
                <div key={day.date} onClick={() => hasSlots && setSelDate(day.date)}
                  className={`fx-daypill${hasSlots ? '' : ' is-off'}`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 9px 8px',
                    borderRadius: 16, cursor: hasSlots ? 'pointer' : 'default', minWidth: 54, flexShrink: 0,
                    border: `1.5px solid ${isActive ? 'transparent' : hasSlots ? BORDER : '#EEF0F6'}`,
                    background: isActive ? `linear-gradient(150deg, ${P}, ${P2})` : '#fff',
                    boxShadow: isActive ? '0 8px 20px rgba(79,70,229,.32)' : 'none',
                    opacity: hasSlots ? 1 : 0.4,
                  }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: isActive ? 'rgba(255,255,255,.85)' : MUTED, textTransform: 'uppercase', letterSpacing: .5 }}>
                    {isToday ? 'Today' : DAYS[d.getDay()]}
                  </div>
                  <div className="fx-display" style={{ fontSize: 19, fontWeight: 800, color: isActive ? '#fff' : TEXT, margin: '2px 0 3px' }}>{d.getDate()}</div>
                  <div style={{ height: 5, display: 'flex', alignItems: 'center' }}>
                    {hasSlots && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,.9)' : '#84CC16' }} />}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Slots grouped by time of day */}
          {selDate && grouped.length > 0 && grouped.map(({ part, slots }) => (
            <div key={part} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, color: SOFT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9 }}>
                <span>{PART_META[part].icon}</span>{part}
                <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${BORDER}, transparent)` }} />
              </div>
              {slots.map(slot => {
                const d = new Date(selDate + 'T00:00:00')
                const maxDur = slot.durs[slot.durs.length - 1]
                return (
                  <button key={slot.time} onClick={() => openRequest(slot)} className="fx-slot" style={{
                    width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 16,
                    padding: '13px 14px', marginBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(150deg, #EEF0FF, #F3EEFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 17 }}>🎾</span>
                      </div>
                      <div>
                        <div className="fx-display" style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{fmt(slot.time)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 1 }}>
                          up to {DUR_LBL[maxDur]} · {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
                        </div>
                      </div>
                    </div>
                    <span style={{ background: `linear-gradient(135deg, ${P}, ${P2})`, color: '#fff', padding: '9px 16px', borderRadius: 100, fontSize: 13, fontWeight: 800, boxShadow: '0 3px 10px rgba(79,70,229,.28)', flexShrink: 0 }}>Request</span>
                  </button>
                )
              })}
            </div>
          ))}

          {selDate && daySlots.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
              <div className="fx-display" style={{ fontSize: 16, fontWeight: 800, color: SOFT, marginBottom: 4 }}>Nothing open this day</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
                {stats.soonest ? `Next opening: ${DAYS[new Date(stats.soonest.date + 'T00:00:00').getDay()]} ${fmt(stats.soonest.time)}` : 'Try another day'}
              </div>
              {stats.soonest && (
                <button onClick={() => setSelDate(stats.soonest.date)} className="fx-ghost" style={{ marginTop: 14, background: '#fff', border: `1.5px solid ${BORDER}`, color: P, padding: '9px 18px', borderRadius: 100, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Jump to next opening →
                </button>
              )}
            </div>
          )}

          {!selDate && (
            <div style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div className="fx-display" style={{ fontSize: 16, fontWeight: 800, color: SOFT }}>No openings right now</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginTop: 4 }}>Check back soon — new times open up often.</div>
            </div>
          )}
        </div>

        {/* Footer CTA — turns every shared link into an advert */}
        <a href="/" className="fx-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', color: MUTED, fontSize: 12.5, fontWeight: 700, marginTop: 22 }}>
          <span style={{ opacity: .8 }}>🎾</span> Powered by <b style={{ color: SOFT }}>Fixturely</b> · <span style={{ color: P, fontWeight: 800 }}>Create your own free page →</span>
        </a>
      </div>

      {/* ── Request sheet ── */}
      {showForm && selSlot && (
        <div onClick={e => e.target === e.currentTarget && setShowForm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(30,27,75,.5)',
          backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fxFade .2s ease both',
        }}>
          <div style={{
            background: '#fff', borderRadius: '26px 26px 0 0', padding: '22px 20px 40px', width: '100%', maxWidth: 500,
            maxHeight: '92vh', overflowY: 'auto', overscrollBehavior: 'contain', animation: 'fxSheet .34s cubic-bezier(.22,1,.36,1) both',
          }}>
            {!submitted ? (
              <>
                <div style={{ width: 42, height: 4, background: '#E5E7EB', borderRadius: 100, margin: '0 auto 18px' }} />
                <div className="fx-display" style={{ fontSize: 21, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Request this lesson</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg, #EEF0FF, #F3EEFF)', padding: '7px 13px', borderRadius: 100, fontSize: 13, fontWeight: 800, color: P_DK, marginBottom: 20 }}>
                  🎾 {fmt(selSlot.time)} · {(() => { const d = new Date(selDate + 'T00:00:00'); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` })()}
                </div>

                <Field label="Duration">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['30m', '45m', '1h'].map(lbl => {
                      const ok = selSlot.durs.includes(lbl), active = selDur === lbl
                      return <Pill key={lbl} active={active} disabled={!ok} onClick={() => setSelDur(lbl)}>{DUR_LBL[lbl]}</Pill>
                    })}
                  </div>
                </Field>

                <Field label="How often?">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['One-time', 'Weekly'].map(lbl => (
                      <Pill key={lbl} active={selRecur === lbl} onClick={() => setSelRecur(lbl)}>{lbl === 'Weekly' ? '🔁 Weekly' : 'One-time'}</Pill>
                    ))}
                  </div>
                </Field>

                <Field label="Your name">
                  <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="e.g. Sarah Johnson" className="fx-input" style={inputStyle} />
                </Field>
                <Field label="Email or phone">
                  <input value={reqContact} onChange={e => setReqContact(e.target.value)} placeholder="e.g. sarah@email.com" className="fx-input" style={inputStyle} />
                </Field>
                <Field label={<>Message <span style={{ color: MUTED, fontWeight: 500 }}>(optional)</span></>}>
                  <textarea value={reqMsg} onChange={e => setReqMsg(e.target.value)} rows={3} placeholder="Anything your coach should know?" className="fx-input" style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} />
                </Field>

                <button onClick={submitRequest} disabled={submitting || !reqName.trim() || !reqContact.trim() || !selRecur} className="fx-cta" style={{
                  width: '100%', padding: 16, background: `linear-gradient(135deg, ${P}, ${P2})`, color: '#fff', border: 'none',
                  borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 18px rgba(79,70,229,.32)', opacity: (!reqName.trim() || !reqContact.trim() || !selRecur) ? 0.5 : 1, marginTop: 6,
                }}>
                  {submitting ? 'Sending…' : !selRecur ? 'Choose one-time or weekly' : 'Send request →'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 6px 4px' }}>
                <div style={{ fontSize: 60, marginBottom: 10, animation: 'fxPop .5s cubic-bezier(.22,1.4,.4,1) both' }}>🎉</div>
                <div className="fx-display" style={{ fontSize: 23, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Request sent!</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: SOFT, lineHeight: 1.6, marginBottom: 8 }}>
                  <b style={{ color: TEXT }}>{coachName}</b> will confirm your lesson shortly.
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: OFF, padding: '9px 14px', borderRadius: 100, fontSize: 13, fontWeight: 700, color: SOFT, marginBottom: 22 }}>
                  🎾 {fmt(selSlot.time)} · {(() => { const d = new Date(selDate + 'T00:00:00'); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` })()} · {DUR_LBL[selDur]}
                </div>

                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Pencil it in</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                  <button onClick={addToGoogle} className="fx-ghost" style={calBtn}>📅 Google Calendar</button>
                  <button onClick={addToIcs} className="fx-ghost" style={calBtn}>🍎 Apple / .ics</button>
                </div>

                <button onClick={() => setShowForm(false)} className="fx-cta" style={{ width: '100%', padding: 15, borderRadius: 14, background: `linear-gradient(135deg, ${P}, ${P2})`, color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(79,70,229,.3)' }}>Done</button>
                <a href="/" className="fx-link" style={{ display: 'block', textDecoration: 'none', color: MUTED, fontSize: 12.5, fontWeight: 700, marginTop: 16 }}>
                  Want a page like this? <span style={{ color: P, fontWeight: 800 }}>Create yours free →</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const chip = {
  display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)',
  color: '#fff', padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)',
}
const inputStyle = {
  width: '100%', padding: '13px 15px', background: OFF, border: `1.5px solid ${BORDER}`, borderRadius: 13,
  fontSize: 15, fontWeight: 600, color: TEXT, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const calBtn = {
  flex: 1, background: '#fff', border: `1.5px solid ${BORDER}`, color: TEXT, padding: '12px 8px', borderRadius: 12,
  fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ fontSize: 12.5, fontWeight: 800, color: SOFT, marginBottom: 7, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}
function Pill({ active, disabled, onClick, children }) {
  return (
    <button disabled={disabled} onClick={onClick} className="fx-ghost" style={{
      flex: 1, padding: '11px 0', borderRadius: 100, fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: `1.5px solid ${active ? 'transparent' : BORDER}`,
      background: active ? `linear-gradient(135deg, ${P}, ${P2})` : '#fff',
      color: active ? '#fff' : disabled ? MUTED : SOFT,
      opacity: disabled ? 0.5 : 1,
      boxShadow: active ? '0 4px 12px rgba(79,70,229,.3)' : 'none',
    }}>{children}</button>
  )
}
