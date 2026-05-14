import { useState, useRef } from 'react'

function CompanyImportBox() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null)
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
      const res = await fetch('/api/companies/import', {
        method: 'POST',
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
        const pr = await fetch(`/api/companies/import/status/${jobId}`)
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
    window.open('/api/import/template/companies', '_blank')
  }

  return (
    <div className="import-box">
      <div className="import-box-title">Import Companies</div>
      <div className="import-box-sub">
        CSV must include: <code>legal_name</code>, <code>country</code> (ISO-3, e.g. GBR).
        Optional: dba_name, status, industry_code, industry_description, address_city,
        address_state, address_postal_code, address_line1, entity_structure, business_type,
        registration_date, employees_min, employees_max, company_url.{' '}
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
              ✓ Imported {jobResult.processed?.toLocaleString()} companies successfully
              {jobResult.errors?.length > 0 && ` (${jobResult.errors.length} rows skipped)`}
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
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-header">
          <div>
            <div className="modal-title">Bulk Import</div>
            <div className="modal-sub">Import companies in bulk from a CSV file</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <CompanyImportBox />
        </div>
      </div>
    </div>
  )
}

export default ImportModal
