export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span className="app-footer-copy">© 2026 CookSmart. All rights reserved.</span>
        <div className="app-footer-right">
          {/* <span>Built by Kissa Samantha</span> */}
          <span>
            WhatsApp:{" "}
            <a
              href="https://wa.me/256706466678"
              className="app-footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              +256706466678
            </a>
          </span>
          <span>
            Phone:{" "}
            <a href="tel:+256776410036" className="app-footer-link">
              +256776410036
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
