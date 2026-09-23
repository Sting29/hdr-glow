export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <p>
        © {year} Konstantin Beregovoy ·{" "}
        <a href="https://www.linkedin.com/in/konstantin-beregovoy/" target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>{" "}
        ·{" "}
        <a href="https://github.com/Sting29/hdr-glow" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </p>
    </footer>
  );
}
