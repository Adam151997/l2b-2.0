import { useState, useEffect } from 'react'

const COUNTRY_NAMES = {
  GBR: 'United Kingdom', USA: 'United States', CAN: 'Canada',
  DEU: 'Germany', FRA: 'France', ITA: 'Italy', ESP: 'Spain',
  NLD: 'Netherlands', BEL: 'Belgium', CHE: 'Switzerland', AUT: 'Austria',
  SWE: 'Sweden', NOR: 'Norway', DNK: 'Denmark', FIN: 'Finland',
  PRT: 'Portugal', GRC: 'Greece', POL: 'Poland', IRL: 'Ireland',
  VGB: 'British Virgin Islands', JEY: 'Jersey', IMN: 'Isle of Man',
  GGY: 'Guernsey', CYM: 'Cayman Islands', BMU: 'Bermuda', GIB: 'Gibraltar',
  AUS: 'Australia', NZL: 'New Zealand', JPN: 'Japan', CHN: 'China',
  IND: 'India', SGP: 'Singapore', HKG: 'Hong Kong', KOR: 'South Korea',
  ARE: 'United Arab Emirates', SAU: 'Saudi Arabia', ISR: 'Israel',
  NGA: 'Nigeria', ZAF: 'South Africa', KEN: 'Kenya', EGY: 'Egypt',
  BRA: 'Brazil', MEX: 'Mexico', ARG: 'Argentina',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] ? `${code} – ${COUNTRY_NAMES[code]}` : code
}

const COLORS = [
  '#5865f2', '#00d4aa', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#10b981', '#f97316', '#6366f1',
]

function HBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2
  return (
    <div className="hbar-row">
      <div className="hbar-label" title={label}>{label}</div>
      <div className="hbar-track">
        <div className="hbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="hbar-value">{Number(value).toLocaleString()}</div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="analytics-stat">
      <div className="analytics-stat-value">{value}</div>
      <div className="analytics-stat-label">{label}</div>
    </div>
  )
}

function AnalyticsModal({ onClose }) {
  const [stats, setStats] = useState(null)
  const [industries, setIndustries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/companies/stats').then(r => r.json()),
      fetch('/api/companies/stats/industry').then(r => r.json()),
    ])
      .then(([s, ind]) => {
        setStats(s)
        setIndustries(ind.industries || [])
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  const countryData = stats
    ? Object.entries(stats.by_country || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
    : []
  const countryMax = countryData[0]?.[1] || 1
  const industryMax = industries?.[0]?.count || 1

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal analytics-modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Data Analytics</div>
            <div className="modal-sub">
              {stats ? `${Number(stats.total_companies).toLocaleString()} companies across ${countryData.length} countries` : 'Loading…'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading && <div className="analytics-loading">Loading data…</div>}
          {error && <div className="analytics-loading" style={{ color: 'var(--danger)' }}>Failed to load: {error}</div>}

          {!loading && !error && (
            <>
              {/* Stat cards */}
              <div className="analytics-stats-row">
                <StatCard
                  label="Total Companies"
                  value={Number(stats?.total_companies || 0).toLocaleString()}
                />
                <StatCard
                  label="Countries"
                  value={Object.keys(stats?.by_country || {}).length}
                />
                <StatCard
                  label="Top Industry"
                  value={industries?.[0]?.name?.slice(0, 28) || '—'}
                />
                <StatCard
                  label="Largest Country"
                  value={countryData[0] ? countryLabel(countryData[0][0]) : '—'}
                />
              </div>

              {/* Charts */}
              <div className="analytics-grid">
                <div className="analytics-section">
                  <div className="analytics-section-title">By Country (top 12)</div>
                  {countryData.map(([code, cnt], i) => (
                    <HBar
                      key={code}
                      label={countryLabel(code)}
                      value={cnt}
                      max={countryMax}
                      color={COLORS[i % COLORS.length]}
                    />
                  ))}
                </div>

                <div className="analytics-section">
                  <div className="analytics-section-title">Top Industries (top 20)</div>
                  {(industries || []).map((ind, i) => (
                    <HBar
                      key={ind.name}
                      label={ind.name}
                      value={ind.count}
                      max={industryMax}
                      color={COLORS[i % COLORS.length]}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyticsModal
