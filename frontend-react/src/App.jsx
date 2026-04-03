import { useState, useEffect } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import SearchForm from './components/SearchForm'
import Results from './components/Results'
import Features from './components/Features'
import ContactModal from './components/ContactModal'
import DetailsModal from './components/DetailsModal'
import Footer from './components/Footer'

function App() {
  const [stats, setStats] = useState({ total_businesses: 0, total_industries: 0 })
  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [showContact, setShowContact] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  async function handleSearch(params) {
    setLoading(true)
    setShowResults(true)
    try {
      const query = new URLSearchParams(params).toString()
      const res = await fetch(`/api/businesses/search?${query}`)
      const data = await res.json()
      setResults(data.data || [])
      setPagination(data.pagination || null)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleViewDetails(business) {
    setSelectedBusiness(business)
    setShowDetails(true)
  }

  function handleViewContact(business) {
    setSelectedBusiness(business)
    setShowContact(true)
  }

  function handlePageChange(page) {
    const params = new URLSearchParams(window.location.search)
    params.set('page', page)
    handleSearch(Object.fromEntries(params))
  }

  return (
    <div className="app">
      <Header />
      <Hero stats={stats} />
      <SearchForm onSearch={handleSearch} loading={loading} />
      
      {showResults && (
        <Results
          results={results}
          pagination={pagination}
          loading={loading}
          onViewDetails={handleViewDetails}
          onViewContact={handleViewContact}
          onPageChange={handlePageChange}
        />
      )}
      
      <Features />
      <Footer />

      {showContact && (
        <ContactModal
          business={selectedBusiness}
          onClose={() => setShowContact(false)}
        />
      )}

      {showDetails && (
        <DetailsModal
          business={selectedBusiness}
          onClose={() => setShowDetails(false)}
          onViewContact={handleViewContact}
        />
      )}
    </div>
  )
}

export default App