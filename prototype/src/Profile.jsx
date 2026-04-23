import { useState } from 'react'
import { getWithingsSession, redirectToWithings, getManualWeight } from './withings.js'
import { activityLevelOptions, lifeContextOptions, coachingOptions, structureOptions, consistencyOptions } from './mockData.js'

// ── Profile storage helpers ──────────────────────────────────────────────────

function loadProfile(athleteId) {
  if (!athleteId) return null
  const raw = localStorage.getItem(`onboarding_profile_${athleteId}`)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function saveProfile(athleteId, profile) {
  localStorage.setItem(`onboarding_profile_${athleteId}`, JSON.stringify(profile))
}

// ── Inline editor ────────────────────────────────────────────────────────────

function EditableField({ label, value, options, onSave }) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(value)

  const displayLabel = options
    ? (typeof options[0] === 'object'
        ? options.find(o => o.value === value)?.label ?? value
        : value)
    : value

  if (!editing) {
    return (
      <div className="profile-row">
        <div>
          <div className="profile-key">{label}</div>
          <div className="profile-val" style={{ marginTop: 2 }}>{displayLabel || <span style={{ color: 'var(--text-tertiary)' }}>Not set</span>}</div>
        </div>
        <button className="edit-field-btn" onClick={() => { setPending(value); setEditing(true) }}>Edit</button>
      </div>
    )
  }

  return (
    <div className="profile-edit-block">
      <div className="profile-key" style={{ marginBottom: 10 }}>{label}</div>
      {options ? (
        <div className="picker-grid" style={{ gridTemplateColumns: '1fr', marginBottom: 12 }}>
          {options.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt
            const lbl = typeof opt === 'object' ? opt.label : opt
            return (
              <button
                key={val}
                className={`picker-option${pending === val ? ' selected' : ''}`}
                onClick={() => setPending(val)}
                style={{ textAlign: 'left', padding: '11px 14px', fontSize: 14 }}
              >
                {lbl}
              </button>
            )
          })}
        </div>
      ) : (
        <input
          className="input-field"
          style={{ marginBottom: 12, width: '100%' }}
          value={pending ?? ''}
          onChange={e => setPending(e.target.value)}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-primary"
          style={{ flex: 1, padding: '10px 0', fontSize: 14 }}
          onClick={() => { onSave(pending); setEditing(false) }}
        >
          Save
        </button>
        <button
          className="btn-secondary"
          style={{ flex: 1, padding: '10px 0', fontSize: 14 }}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Profile({ session, onSignOut }) {
  const athlete = session?.athlete
  const withingsSession = getWithingsSession()

  // Load and allow editing of onboarding profile
  const [profile, setProfileState] = useState(() => loadProfile(athlete?.id))

  function updateField(key, value) {
    const updated = { ...(profile || {}), [key]: value }
    setProfileState(updated)
    if (athlete?.id) saveProfile(athlete.id, updated)
  }

  return (
    <div className="shell">
      <div className="status-bar">
        <span>Training</span>
        <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="header">
        <div className="header-title">Profile.</div>
        <div className="avatar">
          {athlete?.profile_medium
            ? <img src={athlete.profile_medium} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} alt="" />
            : (athlete?.firstname?.[0] ?? 'F')}
        </div>
      </div>

      <div className="scroll-area">

        {/* ── Personal ── */}
        <div className="section">
          <div className="section-label">Personal</div>
          <div className="profile-card">
            {athlete?.firstname && (
              <div className="profile-row">
                <span className="profile-key">Name</span>
                <span className="profile-val">{athlete.firstname} {athlete.lastname}</span>
              </div>
            )}
            {athlete?.city && (
              <div className="profile-row">
                <span className="profile-key">Location</span>
                <span className="profile-val">{athlete.city}{athlete.country ? `, ${athlete.country}` : ''}</span>
              </div>
            )}
            {athlete?.sex && (
              <div className="profile-row">
                <span className="profile-key">Gender</span>
                <span className="profile-val">{athlete.sex === 'M' ? 'Male' : athlete.sex === 'F' ? 'Female' : athlete.sex}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Connected sources ── */}
        <div className="section">
          <div className="section-label">Connected sources</div>
          <div className="profile-card">

            <div className="profile-row">
              <div>
                <div className="profile-key">Strava</div>
                <div className="profile-val-sub">{athlete ? `${athlete.firstname} ${athlete.lastname}` : 'Not connected'}</div>
              </div>
              <span className={`source-badge${session ? ' connected' : ''}`}>
                {session ? 'Connected' : 'Connect'}
              </span>
            </div>

            <div className="profile-row">
              <div>
                <div className="profile-key">Withings</div>
                <div className="profile-val-sub">{withingsSession ? 'Scale connected' : 'Not connected'}</div>
              </div>
              {withingsSession ? (
                <span className="source-badge connected">Connected</span>
              ) : (
                <button className="source-badge" onClick={redirectToWithings}>Connect</button>
              )}
            </div>

            <div className="profile-row" style={{ opacity: 0.35 }}>
              <div>
                <div className="profile-key">InBody</div>
                <div className="profile-val-sub">Coming soon</div>
              </div>
              <span className="source-badge">Soon</span>
            </div>

          </div>
        </div>

        {/* ── Training profile ── */}
        {profile && (
          <div className="section">
            <div className="section-label">Training profile</div>
            <div className="profile-card" style={{ gap: 0 }}>

              <EditableField
                label="Activity level"
                value={profile.activityLevel}
                options={activityLevelOptions}
                onSave={v => updateField('activityLevel', v)}
              />
              <div className="profile-divider" />

              <EditableField
                label="Training days per week"
                value={String(profile.daysPerWeek ?? '')}
                options={['1','2','3','4','5','6','7'].map(n => ({ value: n, label: `${n} day${n === '1' ? '' : 's'}` }))}
                onSave={v => updateField('daysPerWeek', parseInt(v, 10))}
              />
              <div className="profile-divider" />

              <EditableField
                label="Training time preference"
                value={profile.trainingTime}
                options={['Mornings', 'Lunch', 'Evenings', 'When it works']}
                onSave={v => updateField('trainingTime', v)}
              />
              <div className="profile-divider" />

              <EditableField
                label="Life context"
                value={profile.lifeContext}
                options={lifeContextOptions}
                onSave={v => updateField('lifeContext', v)}
              />
              <div className="profile-divider" />

              <EditableField
                label="Structure relationship"
                value={profile.structure}
                options={structureOptions}
                onSave={v => updateField('structure', v)}
              />
              <div className="profile-divider" />

              <EditableField
                label="Consistency goal"
                value={profile.discipline}
                options={consistencyOptions}
                onSave={v => updateField('discipline', v)}
              />
              <div className="profile-divider" />

              <EditableField
                label="Coaching approach"
                value={profile.coaching}
                options={coachingOptions}
                onSave={v => updateField('coaching', v)}
              />

              {profile.nonNegotiables?.length > 0 && (
                <>
                  <div className="profile-divider" />
                  <div className="profile-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="profile-key">Non-negotiables</div>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profile.nonNegotiables.map(n => (
                          <span key={n} className="custom-tag" style={{ margin: 0 }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {profile.keptActivities?.length > 0 && (
                <>
                  <div className="profile-divider" />
                  <div className="profile-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="profile-key">Activities kept for goal</div>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profile.keptActivities.map(a => (
                          <span key={a} className="custom-tag" style={{ margin: 0 }}>{a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {profile.inferenceConfidence && (
                <>
                  <div className="profile-divider" />
                  <div className="profile-row">
                    <span className="profile-key">Inferred from</span>
                    <span className="profile-val" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      8 weeks of Strava data ({profile.inferenceConfidence} confidence)
                    </span>
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {!profile && (
          <div className="section">
            <div className="profile-card">
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>
                Complete onboarding to see your training profile here.
              </p>
            </div>
          </div>
        )}

        {/* ── Sign out ── */}
        <div className="section">
          <button className="sign-out-btn" onClick={onSignOut}>Sign out</button>
        </div>

      </div>
    </div>
  )
}
