import { Nav } from "@/components/Nav";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
        <div className="brand">
          <span className="brand-dot" />
          Jarvis
        </div>
        <Nav />
        <div className="spacer" />
        <form action="/api/logout" method="post">
          <button className="nav-link btn-link" style={{ textDecoration: "none" }}>
            Wyloguj
          </button>
        </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
