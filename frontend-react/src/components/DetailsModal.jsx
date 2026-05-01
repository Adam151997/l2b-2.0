function formatEur(val) {
  const v = parseFloat(val || 0)
  if (v >= 1e9) return `€${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `€${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `€${(v / 1e3).toFixed(0)}K`
  return `€${v.toFixed(0)}`
}

function BuyerDetail({ item, activityLabels }) {
  const activities = item.buyer_mainActivities
    ? item.buyer_mainActivities.split(',').map(s => s.trim()).filter(Boolean)
    : []

  return (
    <>
      <div className="modal-header">
        <div>
          <div className="modal-title">{item.buyer_name}</div>
          <div className="modal-sub">
            {[item.buyer_city, item.buyer_country].filter(Boolean).join(', ')} · Contracting Authority
          </div>
        </div>
        <button className="modal-close" onClick={null}>✕</button>
      </div>
      <div className="modal-body">
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-key">Total Budget Spent</div>
            <div className="detail-val big">{formatEur(item.total_budget_spent_eur)}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">Tenders Issued</div>
            <div className="detail-val big">{(item.total_tenders_issued || 0).toLocaleString()}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">Country</div>
            <div className="detail-val">{item.buyer_country || '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">City</div>
            <div className="detail-val">{item.buyer_city || '—'}</div>
          </div>
          {activities.length > 0 && (
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="detail-key">Sectors</div>
              <div className="badge-list" style={{ marginTop: 6 }}>
                {activities.map(a => (
                  <span key={a} className="badge">{activityLabels[a] || a}</span>
                ))}
              </div>
            </div>
          )}
          <div className="detail-item">
            <div className="detail-key">Avg. Budget per Tender</div>
            <div className="detail-val">
              {item.total_tenders_issued
                ? formatEur(item.total_budget_spent_eur / item.total_tenders_issued)
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SupplierDetail({ item }) {
  return (
    <>
      <div className="modal-header">
        <div>
          <div className="modal-title">{item.bidder_name}</div>
          <div className="modal-sub">{item.bidder_country || '—'} · Supplier</div>
        </div>
        <button className="modal-close" onClick={null}>✕</button>
      </div>
      <div className="modal-body">
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-key">Lifetime Revenue</div>
            <div className="detail-val green">{formatEur(item.lifetime_revenue_eur)}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">Contracts Won</div>
            <div className="detail-val big">{(item.total_contracts_won || 0).toLocaleString()}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">Country</div>
            <div className="detail-val">{item.bidder_country || '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-key">Avg. Contract Value</div>
            <div className="detail-val">
              {item.total_contracts_won
                ? formatEur(item.lifetime_revenue_eur / item.total_contracts_won)
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function DetailsModal({ entity, item, activityLabels, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {entity === 'buyers'
          ? <BuyerDetail item={item} activityLabels={activityLabels} />
          : <SupplierDetail item={item} />
        }
        <div style={{ padding: '0 24px 24px' }}>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default DetailsModal
