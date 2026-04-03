function Features() {
  return (
    <section className="features-section" id="features">
      <div className="container">
        <h2>Powerful Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <i className="fas fa-database"></i>
            <h3>1.38M+ Businesses</h3>
            <p>Comprehensive database of US registered businesses</p>
          </div>
          <div className="feature-card">
            <i className="fas fa-robot"></i>
            <h3>AI Insights</h3>
            <p>DeepSeek AI-powered business analysis</p>
          </div>
          <div className="feature-card">
            <i className="fas fa-search"></i>
            <h3>Smart Search</h3>
            <p>Advanced filtering by location and industry</p>
          </div>
          <div className="feature-card">
            <i className="fas fa-phone"></i>
            <h3>Contact Information</h3>
            <p>Access detailed business information</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features