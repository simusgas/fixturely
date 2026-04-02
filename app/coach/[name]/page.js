'use client'

import { useState, useEffect } from 'react'

const P = '#4F46E5', P_LT = '#EEF2FF', P_DK = '#3730A3'
const TEXT = '#0F172A', SOFT = '#475569', MUTED = '#94A3B8', BORDER = '#E2E8F0', OFF = '#F8FAFC'
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(t) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function CoachPage({ params }) {
  const { name } = params
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [coachName, setCoachName] = useState('')
  const [coachId, setCoachId] = useState('')
  const [slots, setSlots] = useState({})
  const [selDate, setSelDate] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selTime, setSelTime] = useState('')
  const [reqName, setReqName] = useState('')
  const [reqContact, setReqContact] = useState('')
  const [reqMsg, setReqMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/coach-public?slug=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setCoachName(d.coachName)
        setCoachId(d.coachId)
        setSlots(d.slots || {})
        // Auto-select first available date
        const dates = Object.keys(d.slots || {}).sort()
        if (dates.length > 0) setSelDate(dates[0])
        setLoading(false)
      })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [name])

  const dates = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }

  function openRequest(time) {
    setSelTime(time)
    setReqName('')
    setReqContact('')
    setReqMsg('')
    setSubmitted(false)
    setShowForm(true)
  }

  async function submitRequest() {
    if (!reqName.trim()) return
    if (!reqContact.trim()) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          studentName: reqName.trim(),
          contact: reqContact.trim(),
          message: reqMsg.trim(),
          date: selDate,
          time: selTime,
        }),
      })
      const d = await r.json()
      if (d.success) {
        setSubmitted(true)
        // Remove the booked slot from local state
        setSlots(prev => {
          const updated = { ...prev }
          if (updated[selDate]) {
            updated[selDate] = updated[selDate].filter(t => t !== selTime)
            if (updated[selDate].length === 0) delete updated[selDate]
          }
          return updated
        })
      }
    } catch (e) { /* ignore */ }
    setSubmitting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: OFF, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ textAlign: 'center', color: MUTED }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎾</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Loading...</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: OFF, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ textAlign: 'center', color: SOFT }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎾</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Coach not found</div>
        <div style={{ fontSize: 14, color: MUTED }}>This booking page doesn't exist</div>
      </div>
    </div>
  )

  const daySlots = selDate ? (slots[selDate] || []) : []

  return (
    <div style={{ minHeight: '100vh', background: OFF, fontFamily: "'Inter',sans-serif" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(155deg, ${P}, #6366F1, #A5B4FC)`, padding: '40px 20px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>🎾</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>{coachName}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Tennis Coach</div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
        {/* Day strip */}
        <div style={{ fontSize: 11, fontWeight: 800, color: SOFT, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Choose a day</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20, WebkitOverflowScrolling: 'touch' }}>
          {dates.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00')
            const hasSlots = !!slots[dateStr]
            const isActive = dateStr === selDate
            return (
              <div key={dateStr} onClick={() => hasSlots && setSelDate(dateStr)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 11px',
                borderRadius: 14, cursor: hasSlots ? 'pointer' : 'default', minWidth: 52, flexShrink: 0,
                border: `1.5px solid ${isActive ? P : hasSlots ? '#A5B4FC' : BORDER}`,
                background: isActive ? P : '#fff',
                opacity: hasSlots ? 1 : 0.38, transition: 'all 0.2s',
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: isActive ? 'rgba(255,255,255,0.85)' : hasSlots ? P_DK : MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
                  {DAYS[d.getDay()]}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: isActive ? '#fff' : TEXT }}>
                  {d.getDate()}
                </div>
                {hasSlots && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,0.7)' : P, marginTop: 4 }} />}
              </div>
            )
          })}
        </div>

        {/* Slots */}
        {selDate && daySlots.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: SOFT, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Available times</div>
            {daySlots.map(t => {
              const d = new Date(selDate + 'T00:00:00')
              return (
                <div key={t} style={{
                  background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 16,
                  padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: TEXT }}>{fmt(t)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: SOFT, marginTop: 2 }}>
                      1 hour · {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
                    </div>
                  </div>
                  <button onClick={() => openRequest(t)} style={{
                    background: P, color: '#fff', border: 'none', padding: '10px 18px',
                    borderRadius: 100, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    fontFamily: "'Inter',sans-serif", boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                    transition: 'transform 0.15s', flexShrink: 0,
                  }}>Request</button>
                </div>
              )
            })}
          </>
        )}

        {selDate && daySlots.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: SOFT, marginBottom: 4 }}>No available times</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Try another day</div>
          </div>
        )}

        {!selDate && Object.keys(slots).length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: SOFT }}>No available slots right now</div>
          </div>
        )}
      </div>

      {/* Request modal */}
      {showForm && (
        <div onClick={e => e.target === e.currentTarget && setShowForm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.38)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
            width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
          }}>
            {!submitted ? (
              <>
                <div style={{ width: 40, height: 4, background: '#E5E7EB', borderRadius: 100, margin: '0 auto 20px' }} />
                <div style={{ fontSize: 20, fontWeight: 900, color: TEXT, marginBottom: 4 }}>Request a Lesson</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: SOFT, marginBottom: 20 }}>
                  {fmt(selTime)} · {(() => { const d = new Date(selDate + 'T00:00:00'); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` })()}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 800, color: SOFT, marginBottom: 6, display: 'block' }}>Your Name</label>
                  <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="e.g. Sarah Johnson" style={{
                    width: '100%', padding: '12px 15px', background: OFF, border: `1.5px solid ${BORDER}`,
                    borderRadius: 12, fontSize: 15, fontWeight: 600, color: TEXT, fontFamily: "'Inter',sans-serif",
                    outline: 'none', boxSizing: 'border-box',
                  }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 800, color: SOFT, marginBottom: 6, display: 'block' }}>Email or Phone</label>
                  <input value={reqContact} onChange={e => setReqContact(e.target.value)} placeholder="e.g. sarah@email.com" style={{
                    width: '100%', padding: '12px 15px', background: OFF, border: `1.5px solid ${BORDER}`,
                    borderRadius: 12, fontSize: 15, fontWeight: 600, color: TEXT, fontFamily: "'Inter',sans-serif",
                    outline: 'none', boxSizing: 'border-box',
                  }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 800, color: SOFT, marginBottom: 6, display: 'block' }}>Message <span style={{ color: MUTED, fontWeight: 500 }}>(Optional)</span></label>
                  <textarea value={reqMsg} onChange={e => setReqMsg(e.target.value)} placeholder="e.g. I'm a beginner" rows={3} style={{
                    width: '100%', padding: '12px 15px', background: OFF, border: `1.5px solid ${BORDER}`,
                    borderRadius: 12, fontSize: 15, fontWeight: 600, color: TEXT, fontFamily: "'Inter',sans-serif",
                    outline: 'none', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box',
                  }} />
                </div>
                <button onClick={submitRequest} disabled={submitting || !reqName.trim() || !reqContact.trim()} style={{
                  width: '100%', padding: 15, background: `linear-gradient(135deg, ${P}, ${P_DK})`,
                  color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 900,
                  cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                  boxShadow: '0 4px 14px rgba(79,70,229,0.25)',
                  opacity: (!reqName.trim() || !reqContact.trim()) ? 0.5 : 1,
                }}>
                  {submitting ? 'Sending...' : 'Send Request ✓'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: TEXT, marginBottom: 8 }}>Request sent!</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: SOFT, lineHeight: 1.6, marginBottom: 24 }}>
                  {coachName} will get back to you to confirm your lesson.
                </div>
                <button onClick={() => setShowForm(false)} style={{
                  width: '100%', padding: 14, borderRadius: 100, background: P, color: '#fff',
                  border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                }}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
