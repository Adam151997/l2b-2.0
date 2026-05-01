import { useState, useEffect } from 'react'

const COUNTRY_NAMES = {
  AT:'Austria', BE:'Belgium', BG:'Bulgaria', CH:'Switzerland', CY:'Cyprus',
  CZ:'Czech Republic', DE:'Germany', DK:'Denmark', EE:'Estonia', ES:'Spain',
  FI:'Finland', FR:'France', GB:'United Kingdom', GR:'Greece', HR:'Croatia',
  HU:'Hungary', IE:'Ireland', IS:'Iceland', IT:'Italy', LT:'Lithuania',
  LU:'Luxembourg', LV:'Latvia', MT:'Malta', NL:'Netherlands', NO:'Norway',
  PL:'Poland', PT:'Portugal', RO:'Romania', RS:'Serbia', RU:'Russia',
  SE:'Sweden', SI:'Slovenia', SK:'Slovakia', TR:'Turkey', UA:'Ukraine',
  US:'United States', CN:'China', JP:'Japan', IN:'India', CA:'Canada',
  AU:'Australia', IL:'Israel', MA:'Morocco', SA:'Saudi Arabia', AE:'UAE',
  ZA:'South Africa', BR:'Brazil', MX:'Mexico', KR:'South Korea',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] ? `${code} – ${COUNTRY_NAMES[code]}` : code
}

function SearchForm({ entity, filters, onSearch, loading }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [activity, setActivity] = useState('')
  const [sortBy, setSortBy] = useState(entity === 'buyers' ? 'total_budget_spent_eur' : 'lifetime_revenue_eur')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    setSortBy(entity === 'buyers' ? 'total_budget_spent_eur' : 'lifetime_revenue_eur')
    setQ('')
    setCountry('')
    setActivity('')
  }, [entity])

  function handleSubmit(e) {
    e.preventDefault()
    const params = { page: 1, sort_by: sortBy, sort_order: sortOrder }
    if (q.trim()) params.q = q.trim()
    if (country) params.country = country
    if (activity && entity === 'buyers') params.activity = activity
    onSearch(params)
  }

  function handleReset() {
    setQ('')
    setCountry('')
    setActivity('')
    onSearch({ page: 1, sort_by: sortBy, sort_order: sortOrder })
  }

  const countries = entity === 'buyers' ? filters.buyer_countries : filters.supplier_countries
  const buyerSorts = [
    { value: 'total_budget_spent_eur', label: 'Total Budget' },
    { value: 'total_tenders_issued', label: 'Tenders Issued' },
    { value: 'buyer_name', label: 'Name (A–Z)' },
  ]
  const supplierSorts = [
    { value: 'lifetime_revenue_eur', label: 'Lifetime Revenue' },
    { value: 'total_contracts_won', label: 'Contracts Won' },
    { value: 'bidder_name', label: 'Name (A–Z)' },
  ]
  const sorts = entity === 'buyers' ? buyerSorts : supplierSorts

  return (
    <div className="search-panel">
      <div className="search-inner">
        <form className="search-row" onSubmit={handleSubmit}>
          <div className={`field-group ${entity === 'buyers' ? '' : 'wide'}`}>
            <label className="field-label">
              {entity === 'buyers' ? 'Organization name / city' : 'Company name'}
            </label>
            <input
              className="field-input"
              placeholder={entity === 'buyers' ? 'e.g. Ministry, Hospital, University…' : 'e.g. Siemens, Roche…'}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Country</label>
            <select className="field-select" value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map(c => (
                <option key={c} value={c}>{countryLabel(c)}</option>
              ))}
            </select>
          </div>

          {entity === 'buyers' && (
            <div className="field-group">
              <label className="field-label">Sector</label>
              <select className="field-select" value={activity} onChange={e => setActivity(e.target.value)}>
                <option value="">All sectors</option>
                {filters.activities.map(a => (
                  <option key={a} value={a}>
                    {filters.activity_labels[a] || a}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Sort by</label>
            <select className="field-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {sorts.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="field-group" style={{ maxWidth: 100 }}>
            <label className="field-label">Order</label>
            <select className="field-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="desc">Highest</option>
              <option value="asc">Lowest</option>
            </select>
          </div>

          <div className="search-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '...' : 'Search'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SearchForm
