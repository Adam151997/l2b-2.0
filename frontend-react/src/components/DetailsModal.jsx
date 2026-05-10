import { useState, useEffect } from 'react'

function formatEur(val) {
  const v = parseFloat(val || 0)
  if (v >= 1e9) return `€${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `€${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `€${(v / 1e3).toFixed(0)}K`
  return `€${v.toFixed(0)}`
}

function Field({ label, value, mono }) {
  return (
    <div className="detail-item">
      <div className="detail-key">{label}</div>
      <div className={`detail-val ${mono ? 'mono' : ''}`}>{value || <span className="text-muted">—</span>}</div>
    </div>
  )
}

function EditField({ label, name, value, onChange, type = 'text', options }) {
  return (
    <div className="detail-item">
      <label className="detail-key">{label}</label>
      {options ? (
        <select className="edit-input" name={name} value={value || ''} onChange={onChange}>
          <option value="">— not set —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <label className="edit-checkbox-wrap">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange({ target: { name, value: e.target.checked } })}
          />
          <span>{value ? 'Active' : 'Inactive'}</span>
        </label>
      ) : (
        <input
          className="edit-input"
          type={type}
          name={name}
          value={value ?? ''}
          onChange={onChange}
        />
      )}
    </div>
  )
}

// ─── Company Detail View ───────────────────────────────────────────────────────

function CompanyDetail({ item, adminPassword, onUpdate, onClose }) {
  const [tab, setTab] = useState('details')
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [authPw, setAuthPw] = useState('')
  const [authError, setAuthError] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setForm({ ...item })
    setEditMode(false)
    setSaveError(null)
    setTab('details')
    setHistory(null)
  }, [item.company_id])

  function handleField(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function loadHistory() {
    if (history !== null) return
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/companies/${item.company_id}/history`)
      const data = await res.json()
      setHistory(data.edits || [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function handleTabChange(t) {
    setTab(t)
    if (t === 'history') loadHistory()
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const changed = {}
    for (const k of Object.keys(form)) {
      if (form[k] !== item[k]) changed[k] = form[k]
    }
    if (Object.keys(changed).length === 0) {
      setEditMode(false)
      setSaving(false)
      return
    }
    const result = await onUpdate(item.company_id, changed, adminPassword || authPw || undefined)
    setSaving(false)
    if (result.error) {
      if (result.error.includes('admin') || result.error.includes('password') || result.error.includes('403')) {
        setSaveError('Invalid admin password. Please check your credentials.')
      } else {
        setSaveError(result.error)
      }
    } else {
      setEditMode(false)
      setHistory(null)
    }
  }

  function handleEditClick() {
    if (adminPassword) {
      setEditMode(true)
      setSaveError(null)
    } else {
      setTab('auth')
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault()
    setAuthError(null)
    const res = await fetch('/api/import/history', {
      headers: { 'X-Admin-Password': authPw },
    })
    if (res.ok) {
      setTab('details')
      setEditMode(true)
    } else {
      setAuthError('Incorrect password')
    }
  }

  const employees = (() => {
    const min = item.employees_min
    const max = item.employees_max
    if (!min && !max) return null
    if (min && max) return `${Number(min).toLocaleString()} – ${Number(max).toLocaleString()}`
    return Number(min || max).toLocaleString()
  })()

  return (
    <>
      <div className="modal-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="modal-title" title={item.legal_name}>{item.legal_name}</div>
          <div className="modal-sub">
            {[item.address_city, item.address_state, item.country].filter(Boolean).join(', ')}
            {item.source_dataset && <span className="source-tag">{item.source_dataset}</span>}
          </div>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="modal-tabs">
        {['details', 'history'].map(t => (
          <button
            key={t}
            className={`modal-tab ${tab === t ? 'active' : ''}`}
            onClick={() => handleTabChange(t)}
          >
            {t === 'details' ? 'Details' : 'Edit History'}
          </button>
        ))}
        {tab === 'details' && !editMode && (
          <button className="modal-tab-action" onClick={handleEditClick}>✎ Edit</button>
        )}
        {tab === 'details' && editMode && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditMode(false); setForm({ ...item }); setSaveError(null) }}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {tab === 'auth' && (
        <div className="modal-body">
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-icon">🔐</div>
            <p className="auth-msg">Enter admin password to edit this record</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input"
                type="password"
                placeholder="Admin password"
                value={authPw}
                onChange={e => setAuthPw(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary" type="submit">Unlock</button>
            </div>
            {authError && <div className="save-error">{authError}</div>}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => setTab('details')}
            >Back</button>
          </form>
        </div>
      )}

      {tab === 'details' && (
        <div className="modal-body">
          {saveError && <div className="save-error">{saveError}</div>}

          <div className="detail-section">
            <div className="detail-section-title">Identity</div>
            <div className="detail-grid">
              <Field label="Company ID" value={item.company_id} mono />
              {editMode
                ? <EditField label="Legal Name" name="legal_name" value={form.legal_name} onChange={handleField} />
                : <Field label="Legal Name" value={item.legal_name} />}
              {editMode
                ? <EditField label="DBA / Trade Name" name="dba_name" value={form.dba_name} onChange={handleField} />
                : <Field label="DBA / Trade Name" value={item.dba_name} />}
              {editMode
                ? <EditField label="Country" name="country" value={form.country} onChange={handleField} options={['UK', 'USA', 'Canada']} />
                : <Field label="Country" value={item.country} />}
              {editMode
                ? <EditField label="Active" name="is_active" value={form.is_active} onChange={handleField} type="checkbox" />
                : <div className="detail-item">
                    <div className="detail-key">Status</div>
                    <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>}
              {editMode
                ? <EditField label="Status Text" name="status" value={form.status} onChange={handleField} />
                : <Field label="Status Text" value={item.status} />}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Industry</div>
            <div className="detail-grid">
              <Field label="Industry System" value={item.industry_system} />
              {editMode
                ? <EditField label="Industry Code" name="industry_code" value={form.industry_code} onChange={handleField} />
                : <Field label="Industry Code" value={item.industry_code} mono />}
              {editMode
                ? <EditField label="Industry Description" name="industry_description" value={form.industry_description} onChange={handleField} />
                : <Field label="Industry Description" value={item.industry_description} />}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Address</div>
            <div className="detail-grid">
              {editMode
                ? <>
                    <EditField label="Address Line 1" name="address_line1" value={form.address_line1} onChange={handleField} />
                    <EditField label="Address Line 2" name="address_line2" value={form.address_line2} onChange={handleField} />
                    <EditField label="City" name="address_city" value={form.address_city} onChange={handleField} />
                    <EditField label="State / Province" name="address_state" value={form.address_state} onChange={handleField} />
                    <EditField label="Postal Code" name="address_postal_code" value={form.address_postal_code} onChange={handleField} />
                    <EditField label="Address Country" name="address_country" value={form.address_country} onChange={handleField} />
                  </>
                : <>
                    <Field label="Address Line 1" value={item.address_line1} />
                    <Field label="Address Line 2" value={item.address_line2} />
                    <Field label="City" value={item.address_city} />
                    <Field label="State / Province" value={item.address_state} />
                    <Field label="Postal Code" value={item.address_postal_code} />
                    <Field label="Address Country" value={item.address_country} />
                  </>}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Business</div>
            <div className="detail-grid">
              {editMode
                ? <>
                    <EditField label="Entity Structure" name="entity_structure" value={form.entity_structure} onChange={handleField} />
                    <EditField label="Business Type" name="business_type" value={form.business_type} onChange={handleField} />
                    <EditField label="Business Number" name="business_number" value={form.business_number} onChange={handleField} />
                    <EditField label="Registration Date" name="registration_date" value={form.registration_date} onChange={handleField} type="date" />
                    <EditField label="Dissolution Date" name="dissolution_date" value={form.dissolution_date} onChange={handleField} type="date" />
                  </>
                : <>
                    <Field label="Entity Structure" value={item.entity_structure} />
                    <Field label="Business Type" value={item.business_type} />
                    <Field label="Business Number" value={item.business_number} mono />
                    <Field label="Registration Date" value={item.registration_date} />
                    <Field label="Dissolution Date" value={item.dissolution_date} />
                  </>}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Size & Online</div>
            <div className="detail-grid">
              {editMode
                ? <>
                    <EditField label="Min Employees" name="employees_min" value={form.employees_min} onChange={handleField} type="number" />
                    <EditField label="Max Employees" name="employees_max" value={form.employees_max} onChange={handleField} type="number" />
                    <EditField label="Website URL" name="company_url" value={form.company_url} onChange={handleField} />
                  </>
                : <>
                    <Field label="Employees" value={employees} />
                    <div className="detail-item">
                      <div className="detail-key">Website</div>
                      {item.company_url
                        ? <a className="url-link-full" href={item.company_url.startsWith('http') ? item.company_url : `https://${item.company_url}`} target="_blank" rel="noreferrer">
                            {item.company_url}
                          </a>
                        : <span className="text-muted">—</span>}
                    </div>
                  </>}
              <Field label="Language" value={item.original_language} />
              <Field label="Source Dataset" value={item.source_dataset} mono />
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="modal-body">
          {historyLoading && <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
          {!historyLoading && history !== null && history.length === 0 && (
            <div className="table-empty" style={{ padding: '40px 0' }}>
              <div className="table-empty-icon">📋</div>
              <div className="table-empty-title">No edits yet</div>
              <div className="table-empty-sub">Changes to this record will appear here</div>
            </div>
          )}
          {!historyLoading && history && history.length > 0 && (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                  <th>Edited At</th>
                </tr>
              </thead>
              <tbody>
                {history.map(edit => (
                  <tr key={edit.id}>
                    <td className="mono">{edit.field}</td>
                    <td className="old-val">{edit.old_value ?? '—'}</td>
                    <td className="new-val">{edit.new_value ?? '—'}</td>
                    <td className="text-muted">{new Date(edit.edited_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ padding: '0 24px 20px' }}>
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Close</button>
      </div>
    </>
  )
}

// ─── Buyer Detail (unchanged) ─────────────────────────────────────────────────

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
              {item.total_tenders_issued ? formatEur(item.total_budget_spent_eur / item.total_tenders_issued) : '—'}
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
              {item.total_contracts_won ? formatEur(item.lifetime_revenue_eur / item.total_contracts_won) : '—'}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main modal wrapper ────────────────────────────────────────────────────────

function DetailsModal({ entity, item, activityLabels, onClose, adminPassword, onUpdate }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${entity === 'companies' ? 'modal-lg' : ''}`}>
        {entity === 'companies' ? (
          <CompanyDetail
            item={item}
            adminPassword={adminPassword}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        ) : entity === 'buyers' ? (
          <>
            <BuyerDetail item={item} activityLabels={activityLabels} />
            <div style={{ padding: '0 24px 24px' }}>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <SupplierDetail item={item} />
            <div style={{ padding: '0 24px 24px' }}>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DetailsModal
