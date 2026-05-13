function Footer() {
  return (
    <footer className="footer">
      <div>
        <strong style={{ color: 'rgba(255,255,255,.7)' }}>L2B</strong>
        {' · '}Business Intelligence
        {' · '}
        <a href="/docs">API Docs</a>
        {' · '}
        © {new Date().getFullYear()}
      </div>
    </footer>
  )
}

export default Footer
