const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="site-footer">
      © {YEAR} PagoDirecto · Portal de comercios
    </footer>
  )
}
