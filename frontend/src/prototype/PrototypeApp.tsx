import { PAGES, type PageId } from "./data";
import { AllocationPage, HomePage, InventoryPage, PredictionPage } from "./pages";
import { PrototypeStore, usePrototype } from "./store";
import { ConfirmDialog, ContextBar, Toast } from "./ui";
import "./prototype.css";

function Mark() {
  return (
    <svg className="hf-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1F5F8B" />
      <path d="M6 20c3-4 5-4 8 0s5 4 8 0 5-4 8 0" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M6 14c3-4 5-4 8 0s5 4 8 0" fill="none" stroke="#9BD3AE" strokeWidth="2" />
    </svg>
  );
}

function NavIcon({ page }: { page: PageId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (page === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (page === "prediction") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 16c2.5-5 4-7 8-7s5.5 2 8 7" />
        <path {...common} d="M4 12c2.5-4 4-5 8-5s5.5 1 8 5" />
      </svg>
    );
  }
  if (page === "allocation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
        <circle cx="7" cy="17.5" r="1.5" />
        <circle cx="17" cy="17.5" r="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M4 8h16v11H4zM8 8V6h8v2" />
    </svg>
  );
}

function Shell() {
  const { page, pageTitle, setPage } = usePrototype();
  return (
    <div className="hf">
      <div className="hf-frame">
        <aside className="hf-side">
          <div className="hf-brand">
            <Mark />
            <div className="hf-brand-text">
              <strong>
                HydroFlow <em>V1</em>
              </strong>
            </div>
          </div>
          <nav aria-label="Primary">
            {PAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="hf-nav-btn"
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => setPage(item.id)}
              >
                <NavIcon page={item.id} />
                <span className="hf-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
          <p className="hf-side-foot">
            <span>Bago Region, Myanmar</span>
            <span className="hf-local">ပဲခူးတိုင်းဒေသကြီး</span>
          </p>
        </aside>
        <div className="hf-main">
          <header className="hf-header">
            <div>
              <p className="hf-eyebrow">Bago Region</p>
              <h1>{pageTitle}</h1>
            </div>
            <div className="hf-header-meta">
              <span className="hf-demo">DEMO DATA</span>
            </div>
          </header>
          <ContextBar />
          <main className="hf-content" data-page={page}>
            {page === "home" && <HomePage />}
            {page === "prediction" && <PredictionPage />}
            {page === "allocation" && <AllocationPage />}
            {page === "inventory" && <InventoryPage />}
          </main>
          <footer className="hf-footer">Academic prototype. Not for emergency decisions.</footer>
        </div>
      </div>
      <ConfirmDialog />
      <Toast />
    </div>
  );
}

export default function PrototypeApp() {
  return (
    <PrototypeStore>
      <Shell />
    </PrototypeStore>
  );
}
