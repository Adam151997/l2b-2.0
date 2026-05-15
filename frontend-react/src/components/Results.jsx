import { useState } from 'react'

// ── Sort helpers ───────────────────────────────────────────────────────────────

const SORT_COLS = {
  legal_name: 'legal_name',
  country: 'country',
  employees_max: 'employees_max',
}

function SortTh({ col, sortBy, sortOrder, onSort, children, style }) {
  const active = sortBy === col
  function handleClick() {
    onSort(col, active && sortOrder === 'asc' ? 'desc' : 'asc')
  }
  return (
    <th style={{ cursor: 'pointer', userSelect: 'none', ...style }} onClick={handleClick}>
      {children}
      <span className={`sort-icon ${active ? 'sort-active' : ''}`}>
        {active ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
      </span>
    </th>
  )
}

// ── Cell components ────────────────────────────────────────────────────────────

function StatusBadge({ status, active }) {
  const label = status || (active ? 'Active' : 'Inactive')
  const positive = label.toLowerCase().startsWith('active') || label.toLowerCase() === 'registered'
  return (
    <span className={`status-badge ${positive ? 'active' : 'inactive'}`} title={label}>
      {label.length > 14 ? label.slice(0, 13) + '…' : label}
    </span>
  )
}

function EmployeesCell({ min, max }) {
  if (!min && !max) return <span className="text-muted">—</span>
  if (min && max) return <span>{Number(min).toLocaleString()}–{Number(max).toLocaleString()}</span>
  return <span>{Number(min || max).toLocaleString()}</span>
}

function WebsiteCell({ url }) {
  if (!url) return <span className="text-muted">—</span>
  const href = url.startsWith('http') ? url : `https://${url}`
  return (
    <a href={href} target="_blank" rel="noreferrer" className="url-link"
       onClick={e => e.stopPropagation()} title={url}>↗</a>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function CompaniesTable({ results, onRowClick, sortBy, sortOrder, onSort, selectedIds, onToggleSelect, onToggleAll }) {
  const allSelected = results.length > 0 && results.every(r => selectedIds.has(r.company_id))
  const someSelected = !allSelected && results.some(r => selectedIds.has(r.company_id))

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ width: '3%', textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected }}
              onChange={e => onToggleAll(e.target.checked)}
              onClick={e => e.stopPropagation()}
              title="Select / deselect all on page"
            />
          </th>
          <SortTh col="legal_name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} style={{ width: '25%' }}>
            Company Name
          </SortTh>
          <SortTh col="country" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} style={{ width: '7%' }}>
            Country
          </SortTh>
          <th style={{ width: '20%' }}>Industry</th>
          <th style={{ width: '11%' }}>City</th>
          <th style={{ width: '9%', textAlign: 'center' }}>Status</th>
          <SortTh col="employees_max" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} style={{ width: '12%', textAlign: 'right' }}>
            Employees
          </SortTh>
          <th style={{ width: '5%', textAlign: 'center' }}>Web</th>
          <th style={{ width: '4%', textAlign: 'center' }}>Edit</th>
        </tr>
      </thead>
      <tbody>
        {results.map(item => {
          const selected = selectedIds.has(item.company_id)
          return (
            <tr
              key={item.company_id}
              onClick={() => onRowClick(item)}
              className={selected ? 'row-selected' : ''}
            >
              <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.company_id)}
                />
              </td>
              <td>
                <div className="name-cell" title={item.legal_name}>{item.legal_name}</div>
                {item.dba_name && <div className="sub-name" title={item.dba_name}>{item.dba_name}</div>}
              </td>
              <td><span className="country-badge">{item.address_country || item.country || '—'}</span></td>
              <td>
                <div className="industry-cell" title={item.industry_description}>
                  {item.industry_description || '—'}
                </div>
              </td>
              <td className="text-muted">{item.address_city || '—'}</td>
              <td style={{ textAlign: 'center' }}>
                <StatusBadge status={item.status} active={item.is_active} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <EmployeesCell min={item.employees_min} max={item.employees_max} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <WebsiteCell url={item.company_url} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className="edit-icon" title="Click row to view & edit">✎</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total_pages <= 1) return null
  const { page, total_pages, total, limit, is_estimate } = pagination
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const delta = 2
  const pages = []
  for (let i = Math.max(1, page - delta); i <= Math.min(total_pages, page + delta); i++) {
    pages.push(i)
  }
  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onPageChange(1)}>«</button>
      <button className="page-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages[0] > 1 && <span className="page-info">…</span>}
      {pages.map(p => (
        <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => onPageChange(p)}>
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < total_pages && <span className="page-info">…</span>}
      <button className="page-btn" disabled={page >= total_pages} onClick={() => onPageChange(page + 1)}>›</button>
      <button className="page-btn" disabled={page >= total_pages} onClick={() => onPageChange(total_pages)}>»</button>
      <span className="page-info">
        {from.toLocaleString()}–{to.toLocaleString()} of {is_estimate ? '~' : ''}{total.toLocaleString()}
      </span>
    </div>
  )
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({
  results, pagination, loading, hasSearched,
  onRowClick, onPageChange,
  onExportCsv, onExportPdf, onAddCompany,
  sortBy, sortOrder, onSort,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportingSelected, setExportingSelected] = useState(false)

  // Clear selection when results change (new search)
  // We derive a key from result IDs to detect changes
  const resultKey = results.map(r => r.company_id).join(',')

  function handleToggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleToggleAll(checked) {
    if (checked) {
      setSelectedIds(new Set(results.map(r => r.company_id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  async function handleExportSelected() {
    if (selectedIds.size === 0 || exportingSelected) return
    setExportingSelected(true)
    try {
      const res = await fetch('/api/companies/export/selected/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_ids: [...selectedIds] }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `l2b_selected_${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export selected failed:', err)
    } finally {
      setExportingSelected(false)
    }
  }

  if (!hasSearched && !loading) {
    return (
      <section className="results-section">
        <div className="results-inner">
          <div className="table-wrap">
            <div className="table-empty">
              <div className="table-empty-icon">🔍</div>
              <div className="table-empty-title">Start your search</div>
              <div className="table-empty-sub">Search 9M+ companies by name, industry, country, or city</div>
              {onAddCompany && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onAddCompany}>
                  + Add Company
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="results-section">
      <div className="results-inner">
        <div className="results-toolbar">
          <div className="results-count">
            {loading ? 'Searching…' : pagination
              ? <>
                  <strong>{pagination.total.toLocaleString()}</strong>
                  {pagination.is_estimate ? '+ (estimated)' : ''} companies found
                </>
              : 'No results'
            }
          </div>
          <div className="toolbar-right">
            {onAddCompany && (
              <button className="btn btn-add btn-sm" onClick={onAddCompany}>+ Add Company</button>
            )}
            {selectedIds.size > 0 && (
              <button
                className="btn btn-teal btn-sm"
                onClick={handleExportSelected}
                disabled={exportingSelected}
              >
                {exportingSelected ? 'Exporting…' : `↓ Selected (${selectedIds.size})`}
              </button>
            )}
            {!loading && results.length > 0 && (
              <div className="export-group">
                <button className="btn btn-csv btn-sm" onClick={onExportCsv}>↓ CSV (10K)</button>
                <button className="btn btn-pdf btn-sm" onClick={onExportPdf}>↓ PDF (500)</button>
              </div>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-scroll">
            {loading ? (
              <table className="data-table">
                <tbody>
                  <tr className="loading-row">
                    <td colSpan={9}>
                      <div className="spinner" />
                      <div className="text-muted text-sm" style={{ textAlign: 'center' }}>Searching database…</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : results.length === 0 ? (
              <div className="table-empty">
                <div className="table-empty-icon">📭</div>
                <div className="table-empty-title">No results found</div>
                <div className="table-empty-sub">Try adjusting your search filters</div>
              </div>
            ) : (
              <CompaniesTable
                results={results}
                onRowClick={onRowClick}
                sortBy={sortBy || 'legal_name'}
                sortOrder={sortOrder || 'asc'}
                onSort={onSort}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleAll={handleToggleAll}
              />
            )}
          </div>
        </div>

        <Pagination pagination={pagination} onPageChange={onPageChange} />
      </div>
    </section>
  )
}

export default Results
