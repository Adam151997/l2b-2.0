import { useState, useRef } from 'react'

function ImportBox({ entity, label, sub, adminPassword }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // null | 'uploading' | 'processing' | 'done' | 'error'
  const [progress, setProgress] = useState(0)
  const [jobResult, setJobResult] = useState(null)
  const inputRef = useRef()
  const pollRef = useRef()

  function handleFile(e) {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  async function handleImport() {
    if (!file) return
    setStatus('uploading')
    setJobResult(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`/api/import/upload?entity=${entity}`, {
        method: 'POST',
        headers: { 'X-Admin-Password': adminPassword },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setJobResult({ error: data.detail || 'Upload failed' })
        return
      }

      setStatus('processing')
      const jobId = data.job_id
      pollRef.current = setInterval(async () => {
        const pr = await fetch(`/api/import/status/${jobId}`, {
          headers: { 'X-Admin-Password': adminPassword },
        })
        const pData = await pr.json()
        if (pData.total > 0) setProgress(Math.round((pData.processed / pData.total) * 100))
        if (pData.status === 'completed' || pData.status === 'failed') {
          clearInterval(pollRef.current)
          setStatus(pData.status === 'completed' ? 'done' : 'error')
          setJobResult(pData)
        }
      }, 1500)
    } catch (err) {
      setStatus('error')
      setJobResult({ error: String(err) })
    }
  }

  function downloadTemplate() {
    window.open(`/api/import/template/${entity}`, '_blank')
  }

  const color = entity === 'buyers' ? 'var(--blue)' : 'var(--green)'

  return (
    <div className="import-box">
      <div className="import-box-title" style={{ color }}>{label}</div>
      <div className="import-box-sub">
        {sub}{' '}
        <span className="template-link" onClick={downloadTemplate}>
          Download CSV template
        </span>
      </div>

      <div className="import-row">
        <label className="file-label">
          <span>📂</span>
          <span>{file ? file.name : 'Choose CSV file…'}</span>
          <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} />
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={!file || status === 'uploading' || status === 'processing'}
          onClick={handleImport}
        >
          {status === 'uploading' ? 'Uploading…' : status === 'processing' ? 'Importing…' : 'Import'}
        </button>
      </div>

      {status && (
        <div className="import-status">
          {(status === 'uploading' || status === 'processing') && (
            <>
              <div className="status-bar">
                <div className="status-bar-fill" style={{ width: `${progress || 5}%` }} />
              </div>
              <div className="status-text">
                {status === 'uploading' ? 'Uploading file…' : `Importing… ${progress}%`}
              </div>
            </>
          )}
          {status === 'done' && jobResult && (
            <div className="status-text success">
              ✓ Imported {jobResult.processed?.toLocaleString()} rows successfully
              {jobResult.errors?.length > 0 && ` (${jobResult.errors.length} errors)`}
            </div>
          )}
          {status === 'error' && jobResult && (
            <>
              <div className="status-text error">✗ {jobResult.error || 'Import failed'}</div>
              {jobResult.errors?.length > 0 && (
                <div className="error-list">
                  {jobResult.errors.slice(0, 5).map((e, i) => (
                    <div key={i} className="error-item">{e}</div>
                  ))}
                  {jobResult.errors.length > 5 && (
                    <div className="error-item">…and {jobResult.errors.length - 5} more</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ImportModal({ onClose }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [adminPw, setAdminPw] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    const res = await fetch('/api/import/history', {
      headers: { 'X-Admin-Password': password },
    })
    if (res.ok) {
      setAdminPw(password)
      setAuthenticated(true)
    } else {
      setAuthError('Invalid admin password')
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-header">
          <div>
            <div className="modal-title">Data Import</div>
            <div className="modal-sub">Import buyers or suppliers from a CSV file</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!authenticated ? (
            <div className="admin-login">
              <div className="admin-icon">🔐</div>
              <h3>Admin Access</h3>
              <p>Enter the admin password to access the import panel</p>
              <form className="admin-form" onSubmit={handleLogin}>
                <input
                  className="field-input"
                  type="password"
                  placeholder="Admin password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setAuthError('') }}
                />
                <button className="btn btn-primary" type="submit">Login</button>
              </form>
              {authError && (
                <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{authError}</div>
              )}
            </div>
          ) : (
            <>
              <ImportBox
                entity="buyers"
                label="Import Buyers"
                sub="CSV must include: buyer_name, buyer_country. Optional: buyer_city, buyer_mainActivities, total_tenders_issued, total_budget_spent_eur."
                adminPassword={adminPw}
              />
              <ImportBox
                entity="suppliers"
                label="Import Suppliers"
                sub="CSV must include: bidder_name, bidder_country. Optional: total_contracts_won, lifetime_revenue_eur."
                adminPassword={adminPw}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImportModal
