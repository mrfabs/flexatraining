import { useState, useEffect } from 'react'
import { fetchActivities } from './strava.js'
import { detectFTP, confidenceLabel, detectPowerBreakdown, ftpFromDurationPower } from './ftp.js'
import { getWithingsSession, fetchLatestWeight, redirectToWithings, getManualWeight, setManualWeight } from './withings.js'
import { saveMetricSnapshot } from './auth.js'

function getPowerUnit() { return localStorage.getItem('power_unit') || 'W' }
function setPowerUnit(unit) { localStorage.setItem('power_unit', unit) }

function BreakdownSection({ title, rows, weight, powerUnit, editingLabel, onEditStart, onEditCommit, editValue, onEditChange }) {
  return (
    <div className="breakdown-section">
      <div className="breakdown-title">{title}</div>
      {rows.map(row => {
        const isEditing = editingLabel === row.label
        const wkg = row.watts && weight ? Math.round((row.watts / weight) * 100) / 100 : null
        return (
          <div key={row.label} className="breakdown-row" onClick={() => !isEditing && onEditStart(row.label, row.watts)}>
            <span className="breakdown-label">{row.label}</span>
            {isEditing ? (
              <div className="breakdown-edit" onClick={e => e.stopPropagation()}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editValue}
                  onChange={e => onEditChange(e.target.value)}
                  autoFocus
                  style={{ width: 72, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', textAlign: 'right' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>W</span>
                <button onClick={() => onEditCommit(row.label, editValue)} style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>Done</button>
              </div>
            ) : (
              <div className="breakdown-values">
                {row.watts
                  ? <>
                      <span className="breakdown-watts">{row.watts}<span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 2 }}>W</span></span>
                      {weight && <span className="breakdown-wkg">{wkg} <span style={{ fontSize: 11 }}>W/kg</span></span>}
                    </>
                  : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Stats({ session, onMetricsUpdate }) {
  const athlete = session?.athlete

  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [ftpResult, setFtpResult] = useState(null)
  const [weight, setWeight] = useState(null)
  const [weightSource, setWeightSource] = useState(null)
  const [weightLoading, setWeightLoading] = useState(false)
  const [editingWeight, setEditingWeight] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [powerUnit, setPowerUnitState] = useState(getPowerUnit())
  const [breakdown, setBreakdown] = useState(null)

  // Tinkering state
  const [editingLabel, setEditingLabel] = useState(null)
  const [editValue, setEditValue] = useState('')

  const ftp = ftpResult?.ftp ?? null
  const wkg = ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null
  const displayFtp = powerUnit === 'wkg' && weight ? wkg : ftp
  const displayUnit = powerUnit === 'wkg' ? 'W/kg' : 'W'

  function togglePowerUnit() {
    const next = powerUnit === 'W' ? 'wkg' : 'W'
    setPowerUnit(next)
    setPowerUnitState(next)
  }

  useEffect(() => {
    const manual = getManualWeight()
    if (manual) { setWeight(manual); setWeightSource('manual'); onMetricsUpdate?.({ weight: manual }) }

    const ws = getWithingsSession()
    if (!ws?.access_token) return
    setWeightLoading(true)
    fetchLatestWeight(ws.access_token)
      .then(w => {
        if (w !== null) { setWeight(w); setWeightSource('withings'); onMetricsUpdate?.({ weight: w }) }
      })
      .catch(() => {})
      .finally(() => setWeightLoading(false))
  }, [])

  useEffect(() => {
    if (!session?.access_token) { setLoading(false); return }
    fetchActivities(session.access_token, 200)
      .then(data => {
        setActivities(data)
        const result = detectFTP(data)
        if (result) {
          setFtpResult(result)
          onMetricsUpdate?.({ ftp: result.ftp })
          if (athlete) {
            saveMetricSnapshot(athlete.id, { ftp: result.ftp, weight, ftpSource: String(result.sourceActivity?.id) })
          }
        }
        const bd = detectPowerBreakdown(data, result?.ftp ?? null)
        setBreakdown(bd)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  // Recompute breakdown when FTP changes via tinkering
  useEffect(() => {
    if (activities.length && ftp) {
      setBreakdown(detectPowerBreakdown(activities, ftp))
    }
  }, [ftp])

  function handleEditStart(label, watts) {
    setEditingLabel(label)
    setEditValue(watts ? String(watts) : '')
  }

  function handleEditCommit(label, val) {
    const newWatts = parseInt(val, 10)
    if (newWatts > 0) {
      const newFtp = ftpFromDurationPower(label, newWatts)
      if (newFtp && ftpResult) {
        setFtpResult(prev => ({ ...prev, ftp: newFtp }))
        onMetricsUpdate?.({ ftp: newFtp })
      }
    }
    setEditingLabel(null)
  }

  return (
    <div className="shell">
      <div className="status-bar">
        <span>Stats</span>
        <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="header">
        <div className="header-title">Your numbers.</div>
      </div>

      <div className="scroll-area">

        {/* Claude analysis placeholder */}
        <div className="section">
          <div className="feedback-card">
            <div className="feedback-meta">Claude · Today</div>
            <p className="feedback-text">Claude will populate this.</p>
          </div>
        </div>

        {/* Core metrics */}
        <div className="section">
          <div className="section-label-row">
            <span className="section-label" style={{ marginBottom: 0 }}>Key metrics</span>
            {weight && (
              <button className="power-toggle" onClick={togglePowerUnit}>
                {powerUnit === 'W' ? 'W' : 'W/kg'}
              </button>
            )}
          </div>
          <div className="metrics-grid" style={{ marginTop: 12 }}>

            <div className="metric-card">
              <div className="metric-label">FTP</div>
              <div className="metric-value" style={{ fontSize: displayFtp ? undefined : 22, color: displayFtp ? 'var(--text)' : 'var(--text-tertiary)' }}>
                {displayFtp ? <>{displayFtp}<span className="metric-unit">{displayUnit}</span></> : '—'}
              </div>
              <div className="metric-footer">
                <span style={{ fontSize: 11 }}>
                  {ftpResult ? confidenceLabel(ftpResult.confidence) : 'No qualifying ride yet'}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">W/kg</div>
              <div className="metric-value">{wkg !== null ? wkg : '—'}</div>
              <div className="metric-footer">
                <span style={{ fontSize: 11 }}>{weight ? `at ${weight}kg` : 'needs weight'}</span>
              </div>
            </div>

            <div className="metric-card wide">
              <div className="metric-label">Weight</div>
              {weight !== null && !editingWeight ? (
                <>
                  <div className="metric-value">{weight}<span className="metric-unit">kg</span></div>
                  <div className="metric-footer" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11 }}>{weightSource === 'withings' ? 'Withings' : 'Manual'}</span>
                    <button onClick={() => { setWeightInput(String(weight)); setEditingWeight(true) }}
                      style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Update
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="metric-value" style={{ fontSize: weightLoading ? 16 : 34, color: 'var(--text-secondary)' }}>
                    {weightLoading ? 'Loading…' : '—'}
                  </div>
                  {!weightLoading && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={redirectToWithings} className="weight-source-btn">Withings</button>
                        <button disabled className="weight-source-btn" style={{ opacity: 0.35 }}>InBody</button>
                      </div>
                      {editingWeight ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <input type="number" inputMode="decimal" value={weightInput}
                            onChange={e => setWeightInput(e.target.value)} placeholder="74.5" autoFocus
                            style={{ flex: 1, background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none' }} />
                          <button onClick={() => {
                            const v = parseFloat(weightInput)
                            if (v > 0) { setManualWeight(v); setWeight(v); setWeightSource('manual'); onMetricsUpdate?.({ weight: v }) }
                            setEditingWeight(false)
                          }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            Save
                          </button>
                          <button onClick={() => setEditingWeight(false)}
                            style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingWeight(true)}
                          style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                          enter manually
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>

        {/* Power breakdown */}
        {loading && (
          <div className="section">
            <div className="state-message">Loading power data…</div>
          </div>
        )}

        {!loading && !breakdown && (
          <div className="section">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 4px' }}>
              Power breakdown requires rides with a power meter.
            </p>
          </div>
        )}

        {!loading && breakdown && (
          <>
            <div className="section">
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px 4px', lineHeight: 1.5 }}>
                Tap any number to edit it. Changing a value updates your FTP estimate.
              </p>
            </div>
            <div className="section" style={{ paddingTop: 0 }}>
              <BreakdownSection
                title="Sprint"
                rows={breakdown.sprint}
                weight={weight}
                powerUnit={powerUnit}
                editingLabel={editingLabel}
                onEditStart={handleEditStart}
                onEditCommit={handleEditCommit}
                editValue={editValue}
                onEditChange={setEditValue}
              />
              <BreakdownSection
                title="Attack"
                rows={breakdown.attack}
                weight={weight}
                powerUnit={powerUnit}
                editingLabel={editingLabel}
                onEditStart={handleEditStart}
                onEditCommit={handleEditCommit}
                editValue={editValue}
                onEditChange={setEditValue}
              />
              <BreakdownSection
                title="Climb"
                rows={breakdown.climb}
                weight={weight}
                powerUnit={powerUnit}
                editingLabel={editingLabel}
                onEditStart={handleEditStart}
                onEditCommit={handleEditCommit}
                editValue={editValue}
                onEditChange={setEditValue}
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
