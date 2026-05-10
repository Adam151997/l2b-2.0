function Header({ onAdminClick, onAddCompany }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo" onClick={() => window.location.reload()}>
          <div className="logo-icon">L</div>
          <span className="logo-text">L2B<span>.click</span></span>
        </div>
        <nav className="header-nav">
          <a className="nav-btn" href="/docs" target="_blank" rel="noreferrer">
            API
          </a>
          <button className="nav-btn add-btn" onClick={onAddCompany}>
            + Add Company
          </button>
          <button className="nav-btn admin-btn" onClick={onAdminClick}>
            ⚙ Import
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header
