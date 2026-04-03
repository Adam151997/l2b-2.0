import { useState, useEffect } from 'react'

function DetailsModal({ business, onClose, onViewContact }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDetails()
  }, [business?.id])

  async function fetchDetails() {
    if (!business?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/businesses/${business.id}`)
      if (!res.ok) throw new Error('Failed to load details')
      const data = await res.json()
      setDetails(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h3>Business Details</h3>
        
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading business details...</p>
          </div>
        ) : error ? (
          <div className="error">
            <p>Failed to load business details.</p>
          </div>
        ) : details ? (
          <div className="details-content">
            <h4>{details.legal_business_name}</h4>
            <div className="detail-row">
              <label>City</label>
              <span>{details.business_city}</span>
            </div>
            <div className="detail-row">
              <label>State</label>
              <span>{details.business_state}</span>
            </div>
            <div className="detail-row">
              <label>Country</label>
              <span>{details.business_country}</span>
            </div>
            <div className="detail-row">
              <label>Industry</label>
              <span>{details.industry_name}</span>
            </div>
            <div className="detail-row">
              <label>NAICS</label>
              <span>{details.primary_naics}</span>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => { onClose(); onViewContact(business); }}
            >
              <i className="fas fa-envelope"></i> View Contact
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default DetailsModal