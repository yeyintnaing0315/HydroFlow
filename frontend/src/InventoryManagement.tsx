import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Category = "Food" | "Clothes" | "Utensils" | "Tents" | "Other";
type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";
type LocationName = "Bago East" | "Bago West";
type SortKey = "name" | "category" | "quantity" | "status";

interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  status: StockStatus;
  location: LocationName;
  reorderPct: number;
  summaryUnits: number;
}

interface StockUpdate {
  id: string;
  name: string;
  change: string;
  positive: boolean;
  at: string;
  team: string;
  location: LocationName;
}

const CATEGORIES: Category[] = ["Food", "Clothes", "Utensils", "Tents", "Other"];
const LOCATIONS: LocationName[] = ["Bago East", "Bago West"];
const CARD_CATEGORIES: { key: Category; label: string; tone: string }[] = [
  { key: "Clothes", label: "Clothes", tone: "clothes" },
  { key: "Utensils", label: "Utensils", tone: "utensils" },
  { key: "Tents", label: "Tents", tone: "tents" },
  { key: "Food", label: "Foods", tone: "foods" },
];

const SEED_ITEMS: InventoryItem[] = [
  { id: "rice", name: "Rice Bags", category: "Food", quantity: 2500, unit: "kg", status: "In Stock", location: "Bago East", reorderPct: 80, summaryUnits: 488 },
  { id: "water", name: "Drinking Water", category: "Food", quantity: 1200, unit: "L", status: "In Stock", location: "Bago East", reorderPct: 70, summaryUnits: 0 },
  { id: "clothes", name: "Clothes", category: "Clothes", quantity: 450, unit: "pcs", status: "Low Stock", location: "Bago East", reorderPct: 55, summaryUnits: 320 },
  { id: "utensils", name: "Cooking Utensils", category: "Utensils", quantity: 320, unit: "pcs", status: "In Stock", location: "Bago East", reorderPct: 27, summaryUnits: 260 },
  { id: "tents", name: "Tents", category: "Tents", quantity: 120, unit: "pcs", status: "Low Stock", location: "Bago East", reorderPct: 24, summaryUnits: 180 },
  { id: "meds", name: "Medicine Kits", category: "Other", quantity: 300, unit: "pcs", status: "In Stock", location: "Bago East", reorderPct: 62, summaryUnits: 0 },
  { id: "blankets", name: "Blankets", category: "Other", quantity: 450, unit: "pcs", status: "In Stock", location: "Bago East", reorderPct: 68, summaryUnits: 0 },
  { id: "generators", name: "Generators", category: "Other", quantity: 15, unit: "units", status: "Low Stock", location: "Bago East", reorderPct: 40, summaryUnits: 0 },
  { id: "fuel", name: "Fuel (L)", category: "Other", quantity: 600, unit: "L", status: "Out of Stock", location: "Bago East", reorderPct: 18, summaryUnits: 0 },
  { id: "flash", name: "Flashlights", category: "Other", quantity: 200, unit: "pcs", status: "In Stock", location: "Bago East", reorderPct: 50, summaryUnits: 0 },
  { id: "west-rice", name: "Rice Bags", category: "Food", quantity: 800, unit: "kg", status: "In Stock", location: "Bago West", reorderPct: 64, summaryUnits: 120 },
  { id: "west-water", name: "Drinking Water", category: "Food", quantity: 400, unit: "L", status: "In Stock", location: "Bago West", reorderPct: 58, summaryUnits: 60 },
  { id: "west-clothes", name: "Clothes", category: "Clothes", quantity: 150, unit: "pcs", status: "In Stock", location: "Bago West", reorderPct: 48, summaryUnits: 80 },
  { id: "west-tents", name: "Tents", category: "Tents", quantity: 40, unit: "pcs", status: "Low Stock", location: "Bago West", reorderPct: 22, summaryUnits: 40 },
];

const SEED_UPDATES: StockUpdate[] = [
  { id: "u1", name: "Rice Bags", change: "+500 kg", positive: true, at: "Oct 16, 2026 09:42 AM", team: "Field Team", location: "Bago East" },
  { id: "u2", name: "Clothes", change: "-50 pcs", positive: false, at: "Oct 16, 2026 08:30 AM", team: "Distribution Team", location: "Bago East" },
  { id: "u3", name: "Drinking Water", change: "+200 L", positive: true, at: "Oct 15, 2026 06:15 PM", team: "Warehouse", location: "Bago East" },
  { id: "u4", name: "Tents", change: "-20 pcs", positive: false, at: "Oct 15, 2026 02:10 PM", team: "Distribution Team", location: "Bago East" },
  { id: "u5", name: "Medicine Kits", change: "+100 pcs", positive: true, at: "Oct 14, 2026 11:30 AM", team: "NGO Partner", location: "Bago East" },
  { id: "u6", name: "Fuel (L)", change: "+600 L", positive: true, at: "Oct 14, 2026 09:00 AM", team: "Warehouse", location: "Bago East" },
  { id: "u7", name: "Tents", change: "-10 pcs", positive: false, at: "Oct 15, 2026 04:20 PM", team: "Field Team", location: "Bago West" },
];

function statusFor(quantity: number): StockStatus {
  if (quantity <= 0) return "Out of Stock";
  if (quantity < 100) return "Low Stock";
  return "In Stock";
}

function unitFor(category: Category, name: string): string {
  const label = name.toLowerCase();
  if (label.includes("water") || label.includes("fuel")) return "L";
  if (category === "Food") return "kg";
  if (label.includes("generator")) return "units";
  return "pcs";
}

function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function ItemGlyph({ name }: { name: string }) {
  const key = name.toLowerCase();
  const tone = key.includes("rice")
    ? "amber"
    : key.includes("water")
      ? "blue"
      : key.includes("cloth")
        ? "sky"
        : key.includes("utensil")
          ? "orange"
          : key.includes("tent")
            ? "purple"
            : key.includes("medicine")
              ? "green"
              : key.includes("blanket")
                ? "indigo"
                : key.includes("generator")
                  ? "slate"
                  : key.includes("fuel")
                    ? "red"
                    : "yellow";
  return (
    <span className={`item-glyph tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {key.includes("rice") && <path d="M7 9h10l-1 10H8L7 9zm1-3h8l1 3H7l1-3z" />}
        {key.includes("water") && <path d="M9 3h6v2l1 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l1-3V3zm2 7v7h2v-7h-2z" />}
        {key.includes("cloth") && <path d="M8 7l4-3 4 3v3l3 2-2 2-1-1v7H8V13l-1 1-2-2 3-2V7z" />}
        {key.includes("utensil") && <path d="M8 4v7a2 2 0 0 0 4 0V4M10 11v9M16 4c1.5 2 2 4 2 6s-.8 3-2 3v7" />}
        {key.includes("tent") && <path d="M3 19 12 5l9 14H3zm9-8v8" />}
        {key.includes("medicine") && <path d="M8 4h8v6H8zM7 10h10v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8zm5 3v4m-2-2h4" />}
        {key.includes("blanket") && <path d="M5 7h14v10H5zM8 7v10M12 7v10M16 7v10" />}
        {key.includes("generator") && <path d="M5 8h14v9H5zM8 8V6h8v2M9 12h2M13 12h2M12 17v2" />}
        {key.includes("fuel") && <path d="M8 4h6v16H8zM14 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />}
        {!key.match(/rice|water|cloth|utensil|tent|medicine|blanket|generator|fuel/) && (
          <path d="M9 6h6l1 3v9H8V9l1-3zm2 3v6h2V9h-2z" />
        )}
      </svg>
    </span>
  );
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4 7.5 12 12l8-4.5L12 3z" />
      <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export default function InventoryManagement() {
  const [items, setItems] = useState<InventoryItem[]>(SEED_ITEMS);
  const [updates, setUpdates] = useState<StockUpdate[]>(SEED_UPDATES);
  const [location, setLocation] = useState<LocationName>("Bago East");
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const [restockOnly, setRestockOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState<Category | "">("");
  const [itemQuantity, setItemQuantity] = useState("");
  const [detectedName, setDetectedName] = useState("");
  const [detectedCategory, setDetectedCategory] = useState<Category | "">("");
  const [detectedQuantity, setDetectedQuantity] = useState("1");
  const [formError, setFormError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const stopCamera = () => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  };

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !stream) return;
    node.srcObject = stream;
    void node.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  const closeAdd = () => {
    stopCamera();
    setAddOpen(false);
    setDetecting(false);
    setCameraError("");
    setFormError("");
    setItemName("");
    setItemCategory("");
    setItemQuantity("");
    setDetectedName("");
    setDetectedCategory("");
    setDetectedQuantity("1");
  };

  const located = useMemo(
    () => items.filter((item) => item.location === location),
    [items, location],
  );

  const cards = useMemo(() => {
    const counts = { Food: 0, Clothes: 0, Utensils: 0, Tents: 0, Other: 0 };
    for (const item of located) counts[item.category] += item.summaryUnits;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { counts, total };
  }, [located]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const rows = located.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (status !== "all" && item.status !== status) return false;
      if (restockOnly && item.reorderPct >= 30) return false;
      if (!search) return true;
      return `${item.name} ${item.category} ${item.location}`.toLowerCase().includes(search);
    });
    if (!sortKey) return rows;
    const statusRank: Record<StockStatus, number> = { "In Stock": 0, "Low Stock": 1, "Out of Stock": 2 };
    return [...rows].sort((left, right) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "quantity") return (left.quantity - right.quantity) * dir;
      if (sortKey === "status") return (statusRank[left.status] - statusRank[right.status]) * dir;
      return left[sortKey].localeCompare(right[sortKey]) * dir;
    });
  }, [located, category, status, restockOnly, query, sortKey, sortAsc]);

  const alerts = located.filter((item) => item.reorderPct < 30);
  const locationUpdates = updates.filter((update) => update.location === location);
  const shownUpdates = showAllUpdates ? locationUpdates : locationUpdates.slice(0, 4);
  const suggestion = alerts.length
    ? `Stock levels for ${joinNames(alerts.map((item) => item.name))} are below 30%. Consider restocking soon based on forecasted demand.`
    : "Stock levels for this location are above the 30% restock line.";

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((current) => !current);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const addItem = (name: string, nextCategory: Category, quantity: number) => {
    const unit = unitFor(nextCategory, name);
    const next: InventoryItem = {
      id: `item-${Date.now()}`,
      name,
      category: nextCategory,
      quantity,
      unit,
      status: statusFor(quantity),
      location,
      reorderPct: quantity <= 0 ? 0 : quantity < 100 ? 22 : 100,
      summaryUnits: Math.max(quantity, 0),
    };
    setItems((current) => [next, ...current]);
    setUpdates((current) => [
      {
        id: `update-${Date.now()}`,
        name,
        change: `${quantity >= 0 ? "+" : ""}${quantity.toLocaleString()} ${unit}`,
        positive: quantity >= 0,
        at: formatWhen(new Date()),
        team: "Inventory desk",
        location,
      },
      ...current,
    ]);
    closeAdd();
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(itemQuantity);
    if (!itemName.trim()) {
      setFormError("Enter an item name.");
      return;
    }
    if (!itemCategory) {
      setFormError("Choose a category.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setFormError("Enter a quantity of zero or more.");
      return;
    }
    addItem(itemName.trim(), itemCategory, quantity);
  };

  const submitDetected = (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(detectedQuantity);
    if (!detectedName.trim()) {
      setFormError("Name the object in view.");
      return;
    }
    if (!detectedCategory) {
      setFormError("Choose a category for the detected object.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setFormError("Enter a quantity of zero or more.");
      return;
    }
    addItem(detectedName.trim(), detectedCategory, quantity);
  };

  const startDetect = async () => {
    setFormError("");
    setCameraError("");
    setDetecting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser has no camera. Name the object below and add it.");
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setStream(next);
    } catch {
      setCameraError("Camera permission was blocked. Name the object below and add it.");
    }
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setMenuId(null);
  };

  const showRecommendations = () => {
    setRestockOnly(true);
    setStatus("all");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const percent = (value: number) => (cards.total === 0 ? 0 : Math.round((value / cards.total) * 100));

  return (
    <main className="inventory">
      <header className="inv-header">
        <div className="inv-title">
          <span className="inv-mark" aria-hidden="true">
            <CubeIcon />
          </span>
          <div>
            <h2>Inventory Management</h2>
            <p>Track and manage emergency supplies and equipment</p>
          </div>
        </div>
        <div className="inv-header-actions">
          <label className="inv-search">
            <span className="sr-only">Search items, categories, or locations</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16.5 20 20.5" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items, categories, or locations..."
              type="search"
            />
          </label>
          <button type="button" className="add-launch" onClick={() => setAddOpen(true)}>
            + Add Item
          </button>
        </div>
      </header>

      <section className="inv-stats" aria-label="Inventory totals">
        <article className="stat-card tone-total">
          <span className="stat-icon" aria-hidden="true"><CubeIcon /></span>
          <div>
            <p>Total Items</p>
            <strong>{cards.total.toLocaleString()}</strong>
            <small>Across all categories</small>
          </div>
        </article>
        {CARD_CATEGORIES.map((card) => (
          <article key={card.key} className={`stat-card tone-${card.tone}`}>
            <span className="stat-icon" aria-hidden="true">
              <ItemGlyph name={card.key === "Food" ? "Rice Bags" : card.key === "Utensils" ? "Cooking Utensils" : card.label} />
            </span>
            <div>
              <p>{card.label}</p>
              <strong>{cards.counts[card.key].toLocaleString()}</strong>
              <small>({percent(cards.counts[card.key])}%)</small>
            </div>
          </article>
        ))}
      </section>

      <div className="inv-layout">
        <section className="inv-table-card" ref={tableRef}>
          <div className="inv-filters">
            <label>
              Location
              <select
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value as LocationName);
                  setRestockOnly(false);
                }}
              >
                {LOCATIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as Category | "all")}
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={restockOnly ? "restock" : status}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "restock") {
                    setRestockOnly(true);
                    setStatus("all");
                    return;
                  }
                  setRestockOnly(false);
                  setStatus(value as StockStatus | "all");
                }}
              >
                <option value="all">All Status</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
                <option value="restock">Below 30%</option>
              </select>
            </label>
          </div>

          <div className="inv-table" role="table" aria-label="Inventory items">
            <div className="inv-row header" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("name")}>Item</button>
              </span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("category")}>Category</button>
              </span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("quantity")}>Quantity</button>
              </span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("status")}>Status</button>
              </span>
              <span role="columnheader">Actions</span>
            </div>
            {visible.length === 0 && <p className="inv-empty">No items match these filters.</p>}
            {visible.map((item, index) => (
              <div className="inv-row" role="row" key={item.id}>
                <span>{index + 1}</span>
                <span className="item-name">
                  <ItemGlyph name={item.name} />
                  {item.name}
                </span>
                <span><em className={`cat-pill cat-${item.category.toLowerCase()}`}>{item.category}</em></span>
                <span>{item.quantity.toLocaleString()} {item.unit}</span>
                <span><em className={`stock-pill stock-${item.status.replace(/\s+/g, "-").toLowerCase()}`}>{item.status}</em></span>
                <span className="row-actions">
                  <button
                    type="button"
                    aria-label={`Actions for ${item.name}`}
                    aria-expanded={menuId === item.id}
                    onClick={() => setMenuId((current) => (current === item.id ? null : item.id))}
                  >
                    ···
                  </button>
                  {menuId === item.id && (
                    <div className="row-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => removeItem(item.id)}>
                        Remove
                      </button>
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="inv-rail">
          <section className="rail-card alert-card">
            <header>
              <h2>
                <span aria-hidden="true">!</span>
                {" "}Low Stock Alert
              </h2>
              <b>{alerts.length}</b>
            </header>
            {alerts.length === 0 && <p className="rail-empty">No items are below 30%.</p>}
            <ul>
              {alerts.map((item) => (
                <li key={item.id}>
                  <ItemGlyph name={item.name} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.quantity.toLocaleString()} {item.unit} (below 30%)</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rail-card">
            <header>
              <h2>Recent Stock Updates</h2>
              <button type="button" className="text-link" onClick={() => setShowAllUpdates((current) => !current)}>
                {showAllUpdates ? "Show less" : "View All"}
              </button>
            </header>
            <ul className="update-list">
              {shownUpdates.map((update) => (
                <li key={update.id}>
                  <span className={update.positive ? "up" : "down"} aria-hidden="true">{update.positive ? "+" : "−"}</span>
                  <div>
                    <strong>{update.name}</strong>
                    <em className={update.positive ? "up" : "down"}>{update.change}</em>
                    <small>{update.at} · {update.team}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rail-card suggest-card">
            <header>
              <h2>AI Suggestion</h2>
            </header>
            <p>{suggestion}</p>
            <button type="button" className="outline" onClick={showRecommendations}>
              View Recommendations
            </button>
          </section>
        </aside>
      </div>

      {addOpen && (
        <div
          className="inv-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAdd();
          }}
        >
          <div
            className="inv-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-item-title"
          >
            <header className="modal-head">
              <div>
                <h2 id="add-item-title">
                  <span className="inv-mark" aria-hidden="true"><CubeIcon /></span>
                  Add Item
                </h2>
                <p>Choose how you want to add the item to inventory</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close" onClick={closeAdd}>
                ×
              </button>
            </header>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="add-grid">
              <section className="add-card">
                <span className="choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M12 9v6M9 12h6" /></svg>
                </span>
                <h3>Scan Item</h3>
                <p>Use your device camera to scan barcode or QR code and add the item automatically.</p>
                <div className="detect-stage">
                  {stream ? (
                    <video ref={videoRef} autoPlay playsInline muted />
                  ) : (
                    <div className="detect-art" aria-hidden="true">
                      <svg viewBox="0 0 120 72">
                        <rect x="8" y="8" width="104" height="56" rx="10" />
                        <path d="M18 24V16h8M102 24V16h-8M18 48v8h8M102 48v8h-8" />
                        <rect x="46" y="24" width="28" height="24" rx="4" />
                      </svg>
                    </div>
                  )}
                </div>
                {cameraError && <p className="camera-note">{cameraError}</p>}
                {detecting ? (
                  <form onSubmit={submitDetected}>
                    <label>
                      Object name
                      <input
                        value={detectedName}
                        onChange={(event) => setDetectedName(event.target.value)}
                        placeholder="Name the detected object"
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={detectedCategory}
                        onChange={(event) => setDetectedCategory(event.target.value as Category | "")}
                      >
                        <option value="">Select category</option>
                        {CATEGORIES.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="0"
                        value={detectedQuantity}
                        onChange={(event) => setDetectedQuantity(event.target.value)}
                      />
                    </label>
                    <button type="submit">Add detected item</button>
                  </form>
                ) : (
                  <button type="button" onClick={() => void startDetect()}>
                    Scan Now
                  </button>
                )}
              </section>

              <section className="add-card">
                <span className="choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
                </span>
                <h3>Manual Add</h3>
                <p>Enter item details manually if the camera cannot detect the item.</p>
                <form onSubmit={submitManual}>
                  <label>
                    Item Name
                    <input
                      value={itemName}
                      onChange={(event) => setItemName(event.target.value)}
                      placeholder="Enter item name"
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={itemCategory}
                      onChange={(event) => setItemCategory(event.target.value as Category | "")}
                    >
                      <option value="">Select category</option>
                      {CATEGORIES.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="0"
                      value={itemQuantity}
                      onChange={(event) => setItemQuantity(event.target.value)}
                      placeholder="Enter quantity"
                    />
                  </label>
                  <button type="submit">Add Item</button>
                </form>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
