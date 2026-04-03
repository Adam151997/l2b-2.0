function Results({ results, pagination, loading, onViewDetails, onViewContact, onPageChange }) {
  if (loading) {
    return (
      <section className="results-section">
        <div className="container">
          <div className="loading">
            <div className="spinner"></div>
            <p>Searching businesses...</p>
          </div>
        </div>
      </section>
    )
  }

  if (!results.length) {
    return null
  }

  return (
    <section className="results-section" id="results">
      <div className="container">
        <div className="results-header">
          <div className="results-count">
            {pagination?.total ? `${pagination.total.toLocaleString()} businesses found` : `${results.length} businesses`}
          </div>
        </div>
        
        <div className="results-grid">
          {results.map((business) => (
            <div key={business.id} className="business-card">
              <div className="business-header">
                <h3>{business.legal_business_name}</h3>
                <span className="business-tier">{business.tier || 'Free'}</span>
              </div>
              <div className="business-details">
                <p><i className="fas fa-map-marker-alt"></i> {business.business_city}, {business.business_state}</p>
                <p><i className="fas fa-industry"></i> {business.industry_name}</p>
                <p><i className="fas fa-tag"></i> {business.primary_naics}</p>
              </div>
              <div className="business-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => onViewDetails(business)}
                >
                  <i className="fas fa-eye"></i> Details
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => onViewContact(business)}
                >
                  <i className="fas fa-envelope"></i> Contact
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {pagination && pagination.total_pages > 1 && (
          <div className="pagination">
            {pagination.page > 1 && (
              <button
                className="btn btn-outline"
                onClick={() => onPageChange(pagination.page - 1)}
              >
                <i className="fas fa-chevron-left"></i> Previous
              </button>
            )}
            <span className="page-info">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            {pagination.page < pagination.total_pages && (
              <button
                className="btn btn-outline"
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next <i className="fas fa-chevron-right"></i>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default Results