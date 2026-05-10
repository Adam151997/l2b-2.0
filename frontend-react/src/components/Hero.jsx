function Hero({ companyStats, legacyStats, activeTab }) {
  function fmt(n) {
    if (!n) return '...'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
    return n.toLocaleString()
  }

  const byCountry = companyStats.by_country || {}
  const countryKeys = Object.keys(byCountry)

  return (
    <section className="hero">
      <div className="hero-inner">
        <h1 className="hero-title">
          Company <span>Data & Leads</span>
        </h1>
        <p className="hero-sub">
          {fmt(companyStats.total_companies)} companies across {countryKeys.length} markets.
          Search, filter, export leads, and improve data quality.
        </p>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{fmt(companyStats.total_companies)}</div>
            <div className="stat-label">Total Companies</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(companyStats.active_companies)}</div>
            <div className="stat-label">Active</div>
          </div>
          {countryKeys.slice(0, 3).map(c => (
            <div key={c} className="stat-card">
              <div className="stat-value">{fmt(byCountry[c])}</div>
              <div className="stat-label">{c}</div>
            </div>
          ))}
          <div className="stat-card">
            <div className="stat-value">{legacyStats.total_buyers ? fmt(legacyStats.total_buyers) : '...'}</div>
            <div className="stat-label">EU Buyers</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{legacyStats.total_suppliers ? fmt(legacyStats.total_suppliers) : '...'}</div>
            <div className="stat-label">EU Suppliers</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
