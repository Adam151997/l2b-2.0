import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import SearchForm from './components/SearchForm'
import Results from './components/Results'
import DetailsModal from './components/DetailsModal'
import AddCompanyModal from './components/AddCompanyModal'
import ImportModal from './components/ImportModal'
import Footer from './components/Footer'

function App() {
  const [companyStats, setCompanyStats] = useState({ total_companies: 0, active_companies: 0, by_country: {} })
  const [companyFilters, setCompanyFilters] = useState({ countries: [], source_datasets: [] })

  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [lastSearch, setLastSearch] = useState({})

  const [selected, setSelected] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    fetch('/api/companies/stats').then(r => r.ok ? r.json() : null).then(d => d && setCompanyStats(d)).catch(() => {})
    fetch('/api/companies/filters').then(r => r.ok ? r.json() : null).then(d => d && setCompanyFilters(d)).catch(() => {})
  }, [])

  const handleSearch = useCallback(async (params) => {
    setLoading(true)
    setHasSearched(true)
    setLastSearch(params)
    try {
      const qs = new URLSearchParams({ ...params, limit: 25 }).toString()
      const res = await fetch(`/api/companies/search?${qs}`)
      const data = await res.json()
      setResults(data.data || [])
      setPagination(data.pagination || null)
    } catch {
      setResults([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePageChange = useCallback((page) => {
    handleSearch({ ...lastSearch, page })
  }, [handleSearch, lastSearch])

  const handleRowClick = (item) => {
    setSelected(item)
    setShowDetails(true)
  }

  const handleCompanyUpdate = async (companyId, updates) => {
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.json()
      return { error: err.detail || 'Update failed' }
    }
    const updated = await res.json()
    setResults(prev => prev.map(r => r.company_id === companyId ? updated : r))
    setSelected(updated)
    return { success: true, data: updated }
  }

  const handleCompanyCreate = async (data) => {
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      return { error: err.detail || 'Create failed' }
    }
    return { success: true, data: await res.json() }
  }

  const buildExportUrl = () => {
    const qs = new URLSearchParams(lastSearch).toString()
    return `/api/companies/export/csv?${qs}`
  }

  return (
    <div className="app">
      <Header
        onAdminClick={() => setShowImport(true)}
        onAddCompany={() => setShowAddCompany(true)}
      />
      <Hero companyStats={companyStats} />

      <SearchForm
        companyFilters={companyFilters}
        onSearch={handleSearch}
        loading={loading}
      />

      <Results
        results={results}
        pagination={pagination}
        loading={loading}
        hasSearched={hasSearched}
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
        onExportCsv={() => window.open(buildExportUrl(), '_blank')}
        onAddCompany={() => setShowAddCompany(true)}
      />

      <Footer />

      {showDetails && selected && (
        <DetailsModal
          item={selected}
          onClose={() => { setShowDetails(false); setSelected(null) }}
          onUpdate={handleCompanyUpdate}
        />
      )}

      {showAddCompany && (
        <AddCompanyModal
          onClose={() => setShowAddCompany(false)}
          onCreate={handleCompanyCreate}
        />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}

export default App
