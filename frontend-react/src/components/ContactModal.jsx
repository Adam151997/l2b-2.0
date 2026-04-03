import { useState, useEffect } from 'react'

function ContactModal({ business, onClose }) {
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchContact()
  }, [business?.id])

  async function fetchContact() {
    if (!business?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/businesses/${business.id}/contact`)
      if (!res.ok) throw new Error('Failed to load contact')
      const data = await res.json()
      setContact(data)
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
        <h3>Contact Information</h3>
        
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading contact information...</p>
          </div>
        ) : error ? (
          <div className="error">
            <p>Failed to load contact information.</p>
          </div>
        ) : contact ? (
          <div className="contact-info">
            <h4>{contact.business_name}</h4>
            {contact.premium_contact && (
              <>
                <p><i className="fas fa-map-marker-alt"></i> {contact.premium_contact.address}</p>
                <p><i className="fas fa-envelope"></i> {contact.premium_contact.email}</p>
                <p><i className="fas fa-globe"></i> {contact.premium_contact.website}</p>
                <p><i className="fab fa-linkedin"></i> {contact.premium_contact.linkedin}</p>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ContactModal