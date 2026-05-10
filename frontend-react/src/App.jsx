import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import SearchForm from './components/SearchForm'
import Results from './components/Results'
import DetailsModal from './components/DetailsModal'
import AddCompanyModal from './components/AddCompanyModal'
import ImportModal from './components/ImportModal'
import Footer from './components/Footer'

function fmt(n) {
  if (!n) return '...'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toLocaleString()
}

function App() {
  const [activeTab, setActiveTab] = useState('companies')

  const [companyStats, setCompanyStats] = useState({ total_companies: 0, active_companies: 0, by_country: {} })
  const [companyFilters, setCompanyFilters] = useState({ countries: [], source_datasets: [] })
  const [legacyStats, setLegacyStats] = useState({ total_buyers: 0, total_suppliers: 0, total_countries: 0 })
  const [legacyFilters, setLegacyFilters] = useState({ buyer_countries: [], supplier_countries: [], activities: [], activity_labels: {} })

  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [lastSearch, setLastSearch] = useState({})

  const [selected, setSelected] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const [adminPassword, setAdminPassword] = useState(null)

  useEffect(() => {
    fetch('/api/companies/stats').then(r => r.ok ? r.json() : null).then(d => d && setCompanyStats(d)).catch(() => {})
    fetch('/api/companies/filters').then(r => r.ok ? r.json() : null).then(d => d && setCompanyFilters(d)).catch(() => {})
    fetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setLegacyStats(d)).catch(() => {})
    fetch('/api/filters').then(r => r.ok ? r.json() : null).then(d => d && setLegacyFilters(d)).catch(() => {})
  }, [])

  const handleSearch = useCallback(async (params) => {
    setLoading(true)
    setHasSearched(true)
    setLastSearch(params)
    const endpoints = {
      companies: '/api/companies/search',
      buyers: '/api/buyers/search',
      suppliers: '/api/suppliers/search',
    }
    const endpoint = endpoints[activeTab]
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

  const handleCompanyUpdate = async (companyId, updates, pw) => {
    const password = pw || adminPassword
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.json()
      return { error: err.detail || 'Update failed' }
    }
    const updated = await res.json()
    if (pw) setAdminPassword(pw)
    setResults(prev => prev.map(r => r.company_id === companyId ? updated : r))
    setSelected(updated)
    return { success: true, data: updated }
  }

  const handleCompanyCreate = async (data, pw) => {
    const password = pw || adminPassword
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      return { error: err.detail || 'Create failed' }
    }
    if (pw) setAdminPassword(pw)
    return { success: true, data: await res.json() }
  }

  const buildExportUrl = () => {
    const qs = new URLSearchParams(lastSearch).toString()
    if (activeTab === 'companies') return `/api/companies/export/csv?${qs}`
    if (activeTab === 'buyers') return `/api/buyers/export/csv?${qs}`
    return `/api/suppliers/export/csv?${qs}`
  }

  const buildPdfUrl = () => {
    const qs = new URLSearchParams(lastSearch).toString()
    if (activeTab === 'buyers') return `/api/buyers/export/pdf?${qs}`
    if (activeTab === 'suppliers') return `/api/suppliers/export/pdf?${qs}`
    return null
  }

  return (
    <div className="app">
      <Header
        onAdminClick={() => setShowImport(true)}
        onAddCompany={() => setShowAddCompany(true)}
        activeTab={activeTab}
        isAdmin={!!adminPassword}
      />
      <Hero companyStats={companyStats} legacyStats={legacyStats} activeTab={activeTab} />

      <div className="tabs-bar">
        <div className="tabs-inner">
          <button
            className={`tab-btn ${activeTab === 'companies' ? 'active' : ''}`}
            onClick={() => handleTabChange('companies')}
          >
            Companies
            <span className="tab-count">{fmt(companyStats.total_companies)}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'buyers' ? 'active' : ''}`}
            onClick={() => handleTabChange('buyers')}
          >
            EU Buyers
            <span className="tab-count">{legacyStats.total_buyers.toLocaleString()}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
            onClick={() => handleTabChange('suppliers')}
          >
            EU Suppliers
            <span className="tab-count">{legacyStats.total_suppliers.toLocaleString()}</span>
          </button>
        </div>
      </div>

      <SearchForm
        entity={activeTab}
        companyFilters={companyFilters}
        legacyFilters={legacyFilters}
        onSearch={handleSearch}
        loading={loading}
      />

      <Results
        entity={activeTab}
        results={results}
        pagination={pagination}
        loading={loading}
        hasSearched={hasSearched}
        activityLabels={legacyFilters.activity_labels}
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
        onExportCsv={() => window.open(buildExportUrl(), '_blank')}
        onExportPdf={buildPdfUrl() ? () => window.open(buildPdfUrl(), '_blank') : null}
        onAddCompany={activeTab === 'companies' ? () => setShowAddCompany(true) : null}
      />

      <Footer />

      {showDetails && selected && (
        <DetailsModal
          entity={activeTab}
          item={selected}
          activityLabels={legacyFilters.activity_labels}
          onClose={() => { setShowDetails(false); setSelected(null) }}
          adminPassword={adminPassword}
          onUpdate={handleCompanyUpdate}
        />
      )}

      {showAddCompany && (
        <AddCompanyModal
          onClose={() => setShowAddCompany(false)}
          adminPassword={adminPassword}
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
