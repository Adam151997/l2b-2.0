function Hero({ stats }) {
  const formatNumber = (num) => {
    if (!num) return '...'
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M+'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K+'
    return num.toString()
  }

  return (
    <section className="hero">
      <div className="container">
        <h1>Business Intelligence Made Simple</h1>
        <p>Access {formatNumber(stats.total_businesses)} US businesses with AI-powered insights</p>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-number">{formatNumber(stats.total_businesses)}</div>
            <div className="stat-label">Businesses</div>
          </div>
          <div className="stat">
            <div className="stat-number">{formatNumber(stats.total_industries)}</div>
            <div className="stat-label">Industries</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero