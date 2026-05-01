import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import SearchForm from './components/SearchForm'
import Results from './components/Results'
import DetailsModal from './components/DetailsModal'
import ImportModal from './components/ImportModal'
import Footer from './components/Footer'

function App() {
  const [activeTab, setActiveTab] = useState('buyers')
  const [stats, setStats] = useState({ total_buyers: 0, total_suppliers: 0, total_countries: 0 })
  const [filters, setFilters] = useState({ buyer_countries: [], supplier_countries: [], activities: [], activity_labels: {} })
  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [lastSearch, setLastSearch] = useState({})

  useEffect(() => {
    fetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {})
    fetch('/api/filters').then(r => r.ok ? r.json() : null).then(d => d && setFilters(d)).catch(() => {})
  }, [])

  const handleSearch = useCallback(async (params) => {
    setLoading(true)
    setHasSearched(true)
    setLastSearch(params)
    const endpoint = activeTab === 'buyers' ? '/api/buyers/search' : '/api/suppliers/search'
    try {
      const qs = new URLSearchParams({ ...params, limit: 25 }).toString()
      const res = await fetch(`${endpoint}?${qs}`)
      const data = await res.json()
      setResults(data.data || [])
      setPagination(data.pagination || null)
    } catch {
      setResults([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  const handlePageChange = useCallback((page) => {
    handleSearch({ ...lastSearch, page })
  }, [handleSearch, lastSearch])

  const handleRowClick = (item) => {
    setSelected(item)
    setShowDetails(true)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setResults([])
    setPagination(null)
    setHasSearched(false)
    setLastSearch({})
  }

  const buildExportUrl = (format) => {
    const endpoint = activeTab === 'buyers'
      ? `/api/buyers/export/${format}`
      : `/api/suppliers/export/${format}`
    const qs = new URLSearchParams(lastSearch).toString()
    return `${endpoint}?${qs}`
  }

  return (
    <div className="app">
      <Header onAdminClick={() => setShowImport(true)} />
      <Hero stats={stats} />

      <div className="tabs-bar">
        <div className="tabs-inner">
          <button
            className={`tab-btn ${activeTab === 'buyers' ? 'active' : ''}`}
            onClick={() => handleTabChange('buyers')}
          >
            Buyers
            <span className="tab-count">{stats.total_buyers.toLocaleString()}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
            onClick={() => handleTabChange('suppliers')}
          >
            Suppliers
            <span className="tab-count">{stats.total_suppliers.toLocaleString()}</span>
          </button>
        </div>
      </div>

      <SearchForm
        entity={activeTab}
        filters={filters}
        onSearch={handleSearch}
        loading={loading}
      />

      <Results
        entity={activeTab}
        results={results}
        pagination={pagination}
        loading={loading}
        hasSearched={hasSearched}
        activityLabels={filters.activity_labels}
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
        onExportCsv={() => window.open(buildExportUrl('csv'), '_blank')}
        onExportPdf={() => window.open(buildExportUrl('pdf'), '_blank')}
      />

      <Footer />

      {showDetails && selected && (
        <DetailsModal
          entity={activeTab}
          item={selected}
          activityLabels={filters.activity_labels}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}

export default App
