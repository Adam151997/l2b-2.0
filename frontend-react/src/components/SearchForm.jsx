import { useState, useEffect } from 'react'

const COUNTRY_NAMES = {
  AT:'Austria', BE:'Belgium', BG:'Bulgaria', CA:'Canada', CH:'Switzerland',
  CY:'Cyprus', CZ:'Czech Republic', DE:'Germany', DK:'Denmark', EE:'Estonia',
  ES:'Spain', FI:'Finland', FR:'France', GB:'United Kingdom', GR:'Greece',
  HR:'Croatia', HU:'Hungary', IE:'Ireland', IS:'Iceland', IT:'Italy',
  LT:'Lithuania', LU:'Luxembourg', LV:'Latvia', MT:'Malta', NL:'Netherlands',
  NO:'Norway', PL:'Poland', PT:'Portugal', RO:'Romania', RS:'Serbia',
  SE:'Sweden', SI:'Slovenia', SK:'Slovakia', TR:'Turkey', UA:'Ukraine',
  UK:'United Kingdom', US:'United States', USA:'United States',
  CN:'China', JP:'Japan', IN:'India', AU:'Australia',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] ? `${code} – ${COUNTRY_NAMES[code]}` : code
}

function CompaniesSearchForm({ companyFilters, onSearch, loading }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [isActive, setIsActive] = useState('')
  const [sourceDataset, setSourceDataset] = useState('')
  const [sortBy, setSortBy] = useState('legal_name')
  const [sortOrder, setSortOrder] = useState('asc')

  function handleSubmit(e) {
    e.preventDefault()
    const params = { page: 1, sort_by: sortBy, sort_order: sortOrder }
    if (q.trim()) params.q = q.trim()
    if (country) params.country = country
    if (industry.trim()) params.industry = industry.trim()
    if (isActive !== '') params.is_active = isActive
    if (sourceDataset) params.source_dataset = sourceDataset
    onSearch(params)
  }

  function handleReset() {
    setQ(''); setCountry(''); setIndustry(''); setIsActive(''); setSourceDataset('')
    onSearch({ page: 1, sort_by: sortBy, sort_order: sortOrder })
  }

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

          <div className="field-group" style={{ maxWidth: 130 }}>
            <label className="field-label">Status</label>
            <select className="field-select" value={isActive} onChange={e => setIsActive(e.target.value)}>
              <option value="">All</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">Source</label>
            <select className="field-select" value={sourceDataset} onChange={e => setSourceDataset(e.target.value)}>
              <option value="">All sources</option>
              {companyFilters.source_datasets.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
      </div>
    </div>
  )
}

function LegacySearchForm({ entity, legacyFilters, onSearch, loading }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [activity, setActivity] = useState('')
  const [sortBy, setSortBy] = useState(entity === 'buyers' ? 'total_budget_spent_eur' : 'lifetime_revenue_eur')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    setSortBy(entity === 'buyers' ? 'total_budget_spent_eur' : 'lifetime_revenue_eur')
    setQ(''); setCountry(''); setActivity('')
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
    setQ(''); setCountry(''); setActivity('')
    onSearch({ page: 1, sort_by: sortBy, sort_order: sortOrder })
  }

  const countries = entity === 'buyers' ? legacyFilters.buyer_countries : legacyFilters.supplier_countries
  const sorts = entity === 'buyers'
    ? [
        { value: 'total_budget_spent_eur', label: 'Total Budget' },
        { value: 'total_tenders_issued', label: 'Tenders Issued' },
        { value: 'buyer_name', label: 'Name (A–Z)' },
      ]
    : [
        { value: 'lifetime_revenue_eur', label: 'Lifetime Revenue' },
        { value: 'total_contracts_won', label: 'Contracts Won' },
        { value: 'bidder_name', label: 'Name (A–Z)' },
      ]

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
              placeholder={entity === 'buyers' ? 'e.g. Ministry, Hospital…' : 'e.g. Siemens, Roche…'}
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
                {legacyFilters.activities.map(a => (
                  <option key={a} value={a}>{legacyFilters.activity_labels[a] || a}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Sort by</label>
            <select className="field-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {sorts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
            <button className="btn btn-secondary" type="button" onClick={handleReset}>Reset</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SearchForm({ entity, companyFilters, legacyFilters, onSearch, loading }) {
  if (entity === 'companies') {
    return <CompaniesSearchForm companyFilters={companyFilters} onSearch={onSearch} loading={loading} />
  }
  return <LegacySearchForm entity={entity} legacyFilters={legacyFilters} onSearch={onSearch} loading={loading} />
}

export default SearchForm
