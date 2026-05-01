function formatEur(val) {
  const v = parseFloat(val || 0)
  if (v >= 1e9) return `€${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `€${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `€${(v / 1e3).toFixed(0)}K`
  return `€${v.toFixed(0)}`
}

function ActivityCell({ raw, labels }) {
  if (!raw) return <span className="text-muted">—</span>
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const first = labels[parts[0]] || parts[0]
  return (
    <>
      <span className="activity-tag" title={first}>{first}</span>
      {parts.length > 1 && <span className="activity-more">+{parts.length - 1}</span>}
    </>
  )
}

function BuyersTable({ results, activityLabels, onRowClick }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ width: '35%' }}>Organization</th>
          <th style={{ width: '8%' }}>Country</th>
          <th style={{ width: '12%' }}>City</th>
          <th style={{ width: '18%' }}>Sector</th>
          <th style={{ width: '10%', textAlign: 'right' }}>Tenders</th>
          <th style={{ width: '17%', textAlign: 'right' }}>Total Budget</th>
        </tr>
      </thead>
      <tbody>
        {results.map((item, i) => (
          <tr key={i} onClick={() => onRowClick(item)}>
            <td><div className="name-cell" title={item.buyer_name}>{item.buyer_name}</div></td>
            <td><span className="country-badge">{item.buyer_country || '—'}</span></td>
            <td className="text-muted">{item.buyer_city || '—'}</td>
            <td><ActivityCell raw={item.buyer_mainActivities} labels={activityLabels} /></td>
            <td className="num-cell" style={{ textAlign: 'right' }}>
              {(item.total_tenders_issued || 0).toLocaleString()}
            </td>
            <td className="budget-cell" style={{ textAlign: 'right' }}>
              {formatEur(item.total_budget_spent_eur)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SuppliersTable({ results, onRowClick }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ width: '55%' }}>Company</th>
          <th style={{ width: '10%' }}>Country</th>
          <th style={{ width: '15%', textAlign: 'right' }}>Contracts Won</th>
          <th style={{ width: '20%', textAlign: 'right' }}>Lifetime Revenue</th>
        </tr>
      </thead>
      <tbody>
        {results.map((item, i) => (
          <tr key={i} onClick={() => onRowClick(item)}>
            <td><div className="name-cell" title={item.bidder_name}>{item.bidder_name}</div></td>
            <td><span className="country-badge">{item.bidder_country || '—'}</span></td>
            <td className="num-cell" style={{ textAlign: 'right' }}>
              {(item.total_contracts_won || 0).toLocaleString()}
            </td>
            <td className="revenue-cell" style={{ textAlign: 'right' }}>
              {formatEur(item.lifetime_revenue_eur)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total_pages <= 1) return null
  const { page, total_pages, total, limit } = pagination
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const pages = []
  const delta = 2
  for (let i = Math.max(1, page - delta); i <= Math.min(total_pages, page + delta); i++) {
    pages.push(i)
  }

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onPageChange(1)}>«</button>
      <button className="page-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages[0] > 1 && <span className="page-info">…</span>}
      {pages.map(p => (
        <button
          key={p}
          className={`page-btn ${p === page ? 'active' : ''}`}
          onClick={() => onPageChange(p)}
        >{p}</button>
      ))}
      {pages[pages.length - 1] < total_pages && <span className="page-info">…</span>}
      <button className="page-btn" disabled={page >= total_pages} onClick={() => onPageChange(page + 1)}>›</button>
      <button className="page-btn" disabled={page >= total_pages} onClick={() => onPageChange(total_pages)}>»</button>
      <span className="page-info">{from}–{to} of {total.toLocaleString()}</span>
    </div>
  )
}

function Results({ entity, results, pagination, loading, hasSearched, activityLabels, onRowClick, onPageChange, onExportCsv, onExportPdf }) {
  if (!hasSearched && !loading) {
    return (
      <section className="results-section">
        <div className="results-inner">
          <div className="table-wrap">
            <div className="table-empty">
              <div className="table-empty-icon">🔍</div>
              <div className="table-empty-title">Start your search</div>
              <div className="table-empty-sub">
                Use the filters above to search {entity === 'buyers' ? 'EU contracting authorities' : 'EU suppliers'}
              </div>
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
              ? <><strong>{pagination.total.toLocaleString()}</strong> {entity} found</>
              : 'No results'
            }
          </div>
          {!loading && results.length > 0 && (
            <div className="export-group">
              <button className="btn btn-csv btn-sm" onClick={onExportCsv}>
                ↓ CSV (up to 5,000)
              </button>
              <button className="btn btn-pdf btn-sm" onClick={onExportPdf}>
                ↓ PDF (up to 500)
              </button>
            </div>
          )}
        </div>

        <div className="table-wrap">
          <div className="table-scroll">
            {loading ? (
              <table className="data-table">
                <tbody>
                  <tr className="loading-row">
                    <td colSpan={6}>
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
            ) : entity === 'buyers' ? (
              <BuyersTable results={results} activityLabels={activityLabels} onRowClick={onRowClick} />
            ) : (
              <SuppliersTable results={results} onRowClick={onRowClick} />
            )}
          </div>
        </div>

        <Pagination pagination={pagination} onPageChange={onPageChange} />
      </div>
    </section>
  )
}

export default Results
