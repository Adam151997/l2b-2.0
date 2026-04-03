import { useState } from 'react'

function SearchForm({ onSearch, loading }) {
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    state: '',
    industry: ''
  })

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const params = { ...formData }
    // Remove empty fields
    Object.keys(params).forEach(key => {
      if (!params[key]) delete params[key]
    })
    params.page = 1
    onSearch(params)
  }

  return (
    <section className="search-section" id="search">
      <div className="container">
        <h2>Find Your Next Business Opportunity</h2>
        
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Business Name</label>
              <input
                type="text"
                id="name"
                name="name"
                placeholder="e.g., Tech Solutions Inc"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                name="city"
                placeholder="e.g., New York"
                value={formData.city}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="state">State</label>
              <input
                type="text"
                id="state"
                name="state"
                placeholder="e.g., CA"
                value={formData.state}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="industry">Industry</label>
              <input
                type="text"
                id="industry"
                name="industry"
                placeholder="e.g., Technology"
                value={formData.industry}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? (
              <><i className="fas fa-spinner fa-spin"></i> Searching...</>
            ) : (
              <><i className="fas fa-search"></i> Search Businesses</>
            )}
          </button>
        </form>
      </div>
    </section>
  )
}

export default SearchForm