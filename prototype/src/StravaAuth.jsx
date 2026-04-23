import { redirectToStrava } from './auth.js'

export default function StravaAuth({ error }) {
  return (
    <div className="onboarding">
      <div className="done-screen">
        <div className="done-icon">🚴</div>
        <div className="done-title">Training App</div>
        <p className="done-sub">
          Your performance coach. Honest about where you are and where you're going.
        </p>

        <div style={{ marginTop: 32, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className="btn-primary"
            onClick={redirectToStrava}
            style={{ background: '#FC4C02', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Connect with Strava
          </button>

          {error && (
            <p style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginTop: 4 }}>
              {error}
            </p>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 24, textAlign: 'center', lineHeight: 1.5 }}>
          We only read your activity data.<br />Nothing is posted to Strava on your behalf.
        </p>
      </div>
    </div>
  )
}
