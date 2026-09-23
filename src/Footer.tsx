export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <p>
        © {year} Konstantin Beregovoy ·{" "}
        <a href="https://www.linkedin.com/in/konstantin-beregovoy/" target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>{" "}
        · <span className="footer__soon">GitHub (coming soon)</span>
      </p>
    </footer>
  );
}
