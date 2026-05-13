import { useState } from 'react'

function AddCompanyModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    legal_name: '', dba_name: '', country: '',
    industry_code: '', industry_description: '',
    address_city: '', address_state: '', address_line1: '', address_postal_code: '',
    employees_min: '', employees_max: '',
    business_type: '', entity_structure: '',
    registration_date: '', company_url: '', status: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)
  const [done, setDone] = useState(false)

  function handleField(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.legal_name.trim() || !form.country) {
      setError('Company name and country are required')
      return
    }
    setSaving(true)
    const payload = {}
    for (const [k, v] of Object.entries(form)) {
      if (v !== '' && v !== null) payload[k] = v
    }
    const result = await onCreate(payload)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setCreated(result.data)
      setDone(true)
    }
  }

  function F({ label, name, required, options, type = 'text', half = true }) {
    return (
      <div className={`field-group ${half ? '' : 'full-width'}`}>
        <label className="field-label">
          {label}{required && <span className="required-star">*</span>}
        </label>
        {options ? (
          <select className="field-select" name={name} value={form[name] || ''} onChange={handleField}>
            <option value="">— select —</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            className="field-input"
            type={type}
            name={name}
            value={form[name] || ''}
            onChange={handleField}
            required={required}
          />
        )}
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <div className="modal-title">Add New Company</div>
            <div className="modal-sub">Manually add a company to the database</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {!done ? (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="save-error">{error}</div>}
              <div className="add-form-grid">
                <div className="add-form-section">
                  <div className="detail-section-title">Identity</div>
                  <F label="Legal Name" name="legal_name" required />
                  <F label="DBA / Trade Name" name="dba_name" />
                  <F label="Country (ISO-3, e.g. GBR)" name="country" required />
                  <F label="Status" name="status" />
                </div>
                <div className="add-form-section">
                  <div className="detail-section-title">Industry</div>
                  <F label="Industry Code" name="industry_code" />
                  <F label="Industry Description" name="industry_description" half={false} />
                </div>
                <div className="add-form-section">
                  <div className="detail-section-title">Address</div>
                  <F label="Address Line 1" name="address_line1" half={false} />
                  <F label="City" name="address_city" />
                  <F label="State / Province" name="address_state" />
                  <F label="Postal Code" name="address_postal_code" />
                </div>
                <div className="add-form-section">
                  <div className="detail-section-title">Business</div>
                  <F label="Business Type" name="business_type" />
                  <F label="Entity Structure" name="entity_structure" />
                  <F label="Registration Date" name="registration_date" type="date" />
                  <F label="Min Employees" name="employees_min" type="number" />
                  <F label="Max Employees" name="employees_max" type="number" />
                  <F label="Website URL" name="company_url" half={false} />
                </div>
              </div>
            </div>
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" type="button" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" type="submit" style={{ flex: 2 }} disabled={saving}>
                {saving ? 'Saving…' : 'Add Company'}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div className="modal-title" style={{ marginBottom: 8 }}>Company Added</div>
            <div className="modal-sub" style={{ marginBottom: 4 }}>
              <strong>{created.legal_name}</strong> has been added to the database.
            </div>
            <div className="modal-sub" style={{ marginBottom: 24, fontFamily: 'monospace', fontSize: 11 }}>
              ID: {created.company_id}
            </div>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AddCompanyModal
