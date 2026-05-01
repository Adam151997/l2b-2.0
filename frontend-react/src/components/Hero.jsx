function Hero({ stats }) {
  function fmt(n) {
    if (!n) return '...'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
    return n.toLocaleString()
  }

  return (
    <section className="hero">
      <div className="hero-inner">
        <h1 className="hero-title">
          EU Tender <span>Intelligence</span>
        </h1>
        <p className="hero-sub">
          Search {fmt(stats.total_buyers)} buyers and {fmt(stats.total_suppliers)} suppliers
          from EU public procurement data. Export leads as CSV or PDF.
        </p>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{fmt(stats.total_buyers)}</div>
            <div className="stat-label">Buyers</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(stats.total_suppliers)}</div>
            <div className="stat-label">Suppliers</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total_countries || '...'}</div>
            <div className="stat-label">Countries</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
