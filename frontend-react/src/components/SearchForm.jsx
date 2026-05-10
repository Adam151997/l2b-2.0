import { useState } from 'react'

const COUNTRY_NAMES = {
  CA:'Canada', UK:'United Kingdom', USA:'United States',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] ? `${code} – ${COUNTRY_NAMES[code]}` : code
}

function SearchForm({ companyFilters, onSearch, loading }) {
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [isActive, setIsActive] = useState('')
  const [sortBy, setSortBy] = useState('legal_name')
  const [sortOrder, setSortOrder] = useState('asc')

  function handleSubmit(e) {
    e.preventDefault()
    const params = { page: 1, sort_by: sortBy, sort_order: sortOrder }
    if (q.trim()) params.q = q.trim()
    if (country) params.country = country
    if (industry.trim()) params.industry = industry.trim()
    if (isActive !== '') params.is_active = isActive
    onSearch(params)
  }

  function handleReset() {
    setQ(''); setCountry(''); setIndustry(''); setIsActive('')
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

export default SearchForm
