import { useState } from 'react'

const COUNTRY_NAMES = {
  // Main dataset countries
  GBR: 'United Kingdom', USA: 'United States', CAN: 'Canada',
  // Europe
  DEU: 'Germany', FRA: 'France', ITA: 'Italy', ESP: 'Spain',
  NLD: 'Netherlands', BEL: 'Belgium', CHE: 'Switzerland', AUT: 'Austria',
  SWE: 'Sweden', NOR: 'Norway', DNK: 'Denmark', FIN: 'Finland',
  PRT: 'Portugal', GRC: 'Greece', POL: 'Poland', CZE: 'Czech Republic',
  ROU: 'Romania', HUN: 'Hungary', HRV: 'Croatia', SVK: 'Slovakia',
  IRL: 'Ireland', LUX: 'Luxembourg', MLT: 'Malta', CYP: 'Cyprus',
  BGR: 'Bulgaria', SVN: 'Slovenia', EST: 'Estonia', LVA: 'Latvia',
  LTU: 'Lithuania', ISL: 'Iceland', LIE: 'Liechtenstein',
  // British territories (common in UK Companies House)
  VGB: 'British Virgin Islands', JEY: 'Jersey', IMN: 'Isle of Man',
  GGY: 'Guernsey', CYM: 'Cayman Islands', BMU: 'Bermuda', GIB: 'Gibraltar',
  TCA: 'Turks & Caicos', MSR: 'Montserrat', AIA: 'Anguilla',
  // Asia-Pacific
  AUS: 'Australia', NZL: 'New Zealand', JPN: 'Japan', CHN: 'China',
  IND: 'India', SGP: 'Singapore', HKG: 'Hong Kong', KOR: 'South Korea',
  MYS: 'Malaysia', IDN: 'Indonesia', THA: 'Thailand', PHL: 'Philippines',
  TWN: 'Taiwan', VNM: 'Vietnam', BGD: 'Bangladesh', PAK: 'Pakistan',
  // Middle East
  ARE: 'United Arab Emirates', SAU: 'Saudi Arabia', ISR: 'Israel',
  QAT: 'Qatar', KWT: 'Kuwait', BHR: 'Bahrain', OMN: 'Oman', JOR: 'Jordan',
  // Africa
  NGA: 'Nigeria', ZAF: 'South Africa', KEN: 'Kenya', EGY: 'Egypt',
  GHA: 'Ghana', ETH: 'Ethiopia', TZA: 'Tanzania', UGA: 'Uganda',
  CMR: 'Cameroon', ZMB: 'Zambia', ZWE: 'Zimbabwe', RWA: 'Rwanda',
  // Americas
  BRA: 'Brazil', MEX: 'Mexico', ARG: 'Argentina', CHL: 'Chile',
  COL: 'Colombia', PER: 'Peru', VEN: 'Venezuela', ECU: 'Ecuador',
  BOL: 'Bolivia', PRY: 'Paraguay', URY: 'Uruguay', CRI: 'Costa Rica',
  PAN: 'Panama', JAM: 'Jamaica', TTO: 'Trinidad & Tobago',
  // Other
  RUS: 'Russia', TUR: 'Turkey', UKR: 'Ukraine', KAZ: 'Kazakhstan',
  MAR: 'Morocco', TUN: 'Tunisia', DZA: 'Algeria', LBN: 'Lebanon',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] ? `${code} – ${COUNTRY_NAMES[code]}` : code
}

function SearchForm({ companyFilters, onSearch, loading }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [sortBy, setSortBy] = useState('legal_name')
  const [sortOrder, setSortOrder] = useState('asc')

  // Saved searches
  const [savedSearches, setSavedSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('l2b-saved-searches') || '[]') }
    catch { return [] }
  })
  const [saveMode, setSaveMode] = useState(false)
  const [saveName, setSaveName] = useState('')

  function buildParams() {
    const params = { page: 1, sort_by: sortBy, sort_order: sortOrder }
    if (q.trim()) params.q = q.trim()
    if (country) params.country = country
    if (industry.trim()) params.industry = industry.trim()
    return params
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSearch(buildParams())
  }

  function handleReset() {
    setQ(''); setCountry(''); setIndustry('')
    setSortBy('legal_name'); setSortOrder('asc')
    onSearch({ page: 1, sort_by: 'legal_name', sort_order: 'asc' })
  }

  function handleSave() {
    if (!saveName.trim()) return
    const entry = { name: saveName.trim(), q, country, industry, sortBy, sortOrder }
    const updated = [...savedSearches.filter(s => s.name !== entry.name), entry]
    setSavedSearches(updated)
    localStorage.setItem('l2b-saved-searches', JSON.stringify(updated))
    setSaveMode(false)
    setSaveName('')
  }

  function handleRecall(entry) {
    setQ(entry.q || '')
    setCountry(entry.country || '')
    setIndustry(entry.industry || '')
    setSortBy(entry.sortBy || 'legal_name')
    setSortOrder(entry.sortOrder || 'asc')
    const params = { page: 1, sort_by: entry.sortBy || 'legal_name', sort_order: entry.sortOrder || 'asc' }
    if (entry.q) params.q = entry.q
    if (entry.country) params.country = entry.country
    if (entry.industry) params.industry = entry.industry
    onSearch(params)
  }

  function handleDelete(name, e) {
    e.stopPropagation()
    const updated = savedSearches.filter(s => s.name !== name)
    setSavedSearches(updated)
    localStorage.setItem('l2b-saved-searches', JSON.stringify(updated))
  }

  const hasFilters = q.trim() || country || industry.trim()

  return (
    <div className="search-panel">
      <div className="search-inner">
        <form className="search-row" onSubmit={handleSubmit}>
          <div className="field-group wide">
            <label className="field-label">Company name / DBA / city</label>
            <input
              className="field-input"
              placeholder="e.g. Microsoft, Tesco, KPMG, London…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Country</label>
            <select className="field-select" value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {companyFilters.countries.map(c => (
                <option key={c} value={c}>{countryLabel(c)}</option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">Industry</label>
            <input
              className="field-input"
              placeholder="e.g. Software, Construction…"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
            />
          </div>

          <div className="field-group" style={{ maxWidth: 160 }}>
            <label className="field-label">Sort by</label>
            <select className="field-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="legal_name">Name (A–Z)</option>
              <option value="country">Country</option>
              <option value="registration_date">Registration Date</option>
              <option value="employees_max">Employees</option>
            </select>
          </div>

          <div className="field-group" style={{ maxWidth: 100 }}>
            <label className="field-label">Order</label>
            <select className="field-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
          </div>

          <div className="search-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '...' : 'Search'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleReset}>Reset</button>
          </div>
        </form>

        {/* Saved searches bar */}
        <div className="saved-bar">
          <div className="saved-chips">
            {savedSearches.map(s => (
              <span key={s.name} className="saved-chip" onClick={() => handleRecall(s)} title="Recall this search">
                {s.name}
                <span className="saved-chip-del" onClick={e => handleDelete(s.name, e)}>×</span>
              </span>
            ))}
          </div>

          {saveMode ? (
            <div className="save-input-row">
              <input
                className="field-input save-input"
                placeholder="Search name…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" type="button" onClick={handleSave}>Save</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setSaveMode(false); setSaveName('') }}>Cancel</button>
            </div>
          ) : (
            <button
              className="btn btn-secondary btn-sm save-btn"
              type="button"
              onClick={() => setSaveMode(true)}
              disabled={!hasFilters}
              title={hasFilters ? 'Save current search filters' : 'Set filters first to save a search'}
            >
              ⭐ Save search
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchForm
