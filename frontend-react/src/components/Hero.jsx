function Hero({ companyStats }) {
  function fmt(n) {
    if (!n) return '...'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
    return n.toLocaleString()
  }

  const byCountry = companyStats.by_country || {}

  return (
    <section className="hero">
      <div className="hero-inner">
        <h1 className="hero-title">
          Company <span>Data & Leads</span>
        </h1>
        <p className="hero-sub">
          {fmt(companyStats.total_companies)} companies across 3 markets.
          Search, filter, export leads, and improve data quality.
        </p>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{fmt(companyStats.total_companies)}</div>
            <div className="stat-label">Total Companies</div>
          </div>
          {['UK', 'USA', 'Canada'].map(c => (
            <div key={c} className="stat-card">
              <div className="stat-value">{fmt(byCountry[c])}</div>
              <div className="stat-label">{c}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Hero
