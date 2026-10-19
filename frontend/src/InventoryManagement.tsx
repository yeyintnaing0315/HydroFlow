import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { InventoryClass, InventorySnapshot } from "./types";

type RegionCode = "east" | "west";
type StockStatus = "Out of Stock" | "Critical" | "Low Stock" | "In Stock" | "Full";
type SortKey = "name" | "category" | "quantity" | "status";

interface Resource<T> {
  state: "loading" | "ready" | "error";
  data?: T;
  error?: string;
}

interface StockRow {
  key: string;
  name: string;
  itemCode: string | null;
  classCode: string;
  className: string;
  quantity: number;
  unit: string;
  status: StockStatus;
  fill: number;
}

interface DetectionView {
  category_code: string;
  item_code: string;
  quantity: number;
  name: string;
  unit: string;
}

const LOCATIONS: { region: RegionCode; label: "Bago East" | "Bago West" }[] = [
  { region: "east", label: "Bago East" },
  { region: "west", label: "Bago West" },
];

const CLASS_ORDER = ["clothes", "foods", "utility", "fund"];
const CLASS_CAPACITY = 5000;
const FUND_CAPACITY = 10_000_000;

const STATUS_RANK: Record<StockStatus, number> = {
  "Out of Stock": 0,
  Critical: 1,
  "Low Stock": 2,
  "In Stock": 3,
  Full: 4,
};

const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Unexpected request failure";

function classRank(code: string): number {
  const index = CLASS_ORDER.indexOf(code);
  return index === -1 ? CLASS_ORDER.length : index;
}

function classCapacity(row: InventoryClass): number {
  if (row.capacity && row.capacity > 0) return row.capacity;
  return row.code === "fund" ? FUND_CAPACITY : CLASS_CAPACITY;
}

function fillRatio(quantity: number, capacity: number): number {
  if (quantity <= 0 || capacity <= 0) return 0;
  return (quantity / capacity) * 100;
}

function displayPercent(quantity: number, capacity: number): number {
  const ratio = fillRatio(quantity, capacity);
  if (ratio <= 0) return 0;
  const rounded = Math.round(ratio);
  return Math.min(100, rounded === 0 ? 1 : rounded);
}

function statusFor(quantity: number, capacity: number): StockStatus {
  if (quantity <= 0) return "Out of Stock";
  const ratio = fillRatio(quantity, capacity);
  if (ratio < 30) return "Critical";
  if (ratio < 60) return "Low Stock";
  if (ratio < 100) return "In Stock";
  return "Full";
}

function statusSlug(status: StockStatus): string {
  return status.replace(/\s+/g, "-").toLowerCase();
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yangon",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function pillClass(code: string): string {
  if (code === "foods") return "cat-foods";
  if (code === "clothes") return "cat-clothes";
  if (code === "utility") return "cat-utility";
  if (code === "fund") return "cat-fund";
  return "cat-other";
}

function toneClass(code: string): string {
  if (code === "clothes") return "tone-clothes";
  if (code === "foods") return "tone-foods";
  if (code === "utility") return "tone-utility";
  if (code === "fund") return "tone-fund";
  return "tone-total";
}

function unitLabel(unit: string): string {
  return unit.toLowerCase() === "mmk" ? "MMK" : unit;
}

function subclassLabel(
  snapshot: InventorySnapshot | undefined,
  categoryCode: string,
  itemCode: string,
): { name: string; unit: string } {
  const item = snapshot?.classes
    .find((row) => row.code === categoryCode)
    ?.items.find((entry) => entry.code === itemCode);
  return { name: item?.name ?? itemCode, unit: item?.unit ?? "" };
}

function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return Promise.reject(new Error("The camera frame is not ready yet."));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Could not capture a frame."));
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not capture a frame."));
      else resolve(blob);
    }, "image/jpeg", 0.92);
  });
}

function Glyph({ tone, compact, children }: { tone: string; compact?: boolean; children: ReactNode }) {
  return (
    <span className={`item-glyph tone-${tone}${compact ? " is-compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">{children}</svg>
    </span>
  );
}

function TotalItemsIcon({ compact = false }: { compact?: boolean }) {
  return (
    <Glyph tone="slate" compact={compact}>
      <path d="M4 8h7v7H4zM13 8h7v7h-7zM8 15h7v5H8z" />
    </Glyph>
  );
}

function ClassGlyph({ classCode, compact = false }: { classCode: string; compact?: boolean }) {
  const tone = classCode === "clothes" ? "sky" : classCode === "foods" ? "amber" : classCode === "fund" ? "green" : "orange";
  return (
    <Glyph tone={tone} compact={compact}>
      {classCode === "clothes" && <path d="M8 7l4-3 4 3v3l3 2-2 2-1-1v7H8V13l-1 1-2-2 3-2V7z" />}
      {classCode === "foods" && <path d="M7 9h10l-1 10H8L7 9zm1-3h8l1 3H7l1-3z" />}
      {classCode === "fund" && <path d="M5 8h14v9H5zM8 8V6h8v2M9 12h6" />}
      {classCode !== "clothes" && classCode !== "foods" && classCode !== "fund" && (
        <path d="M5 7h14v10H5zM8 7v10M12 7v10M16 7v10" />
      )}
    </Glyph>
  );
}

function ItemGlyph({ itemCode, compact = false }: { itemCode: string | null; compact?: boolean }) {
  const key = itemCode ?? "fund";
  const tone = key.includes("cloth") || key === "tshirt" ? "sky" : key === "rice" || key === "oil" || key === "can" ? "amber" : "orange";
  return (
    <Glyph tone={tone} compact={compact}>
      {key === "tshirt" && <path d="M8 6l4-2 4 2 3 2-2 2h-2v8H9V10H7L5 8z" />}
      {key === "m_cloth" && <path d="M8 5h8l2 3v12H6V8zM10 5v3h4V5" />}
      {key === "f_cloth" && <path d="M9 4h6l3 4-2 2v10H8V10L6 8z" />}
      {key === "rice" && <path d="M7 9h10l-1 10H8zM8 6h8l1 3H7z" />}
      {key === "oil" && <path d="M9 3h6v3l1 2v12H8V8l1-2z" />}
      {key === "can" && <path d="M8 6h8v12H8zM8 6c0-1 8-1 8 0M8 18c0 1 8 1 8 0" />}
      {key === "blanket" && <path d="M5 7h14v10H5zM8 7v10M12 7v10M16 7v10" />}
      {key === "soap" && <path d="M7 9h10v8H7zM9 9V7h6v2" />}
      {key === "cup" && <path d="M8 6h6v9a3 3 0 0 1-6 0zM14 8h2a2 2 0 0 1 0 4h-2" />}
      {key === "spoon" && <path d="M10 4c2 2 2 4 0 6l1 8h2l1-8c-2-2-2-4 0-6" />}
      {key === "mug" && <path d="M7 7h8v8a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3zM15 9h2a2 2 0 0 1 0 4h-2" />}
      {key === "box" && <path d="M4 8l8-3 8 3-8 3zM4 8v8l8 3V11M20 8v8l-8 3" />}
      {key === "towel" && <path d="M7 4h10v16H7zM9 4v16" />}
      {key === "plate" && <path d="M5 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0zm3 0a4 4 0 1 0 8 0" />}
      {key === "netbed" && <path d="M4 10h16v6H4zM6 10V7h4M18 10V7h-4M4 16v2M20 16v2" />}
      {key === "knife" && <path d="M14 4l4 2-8 10H6l8-12zM8 16l2 4" />}
      {key === "bowl" && <path d="M5 10h14c0 5-3 8-7 8s-7-3-7-8z" />}
      {key === "pot" && <path d="M6 10h12v7H6zM4 10h16M9 10V7M15 10V7" />}
      {key === "fund" && <path d="M5 8h14v9H5zM8 8V6h8v2M9 12h6" />}
    </Glyph>
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
  const [region, setRegion] = useState<RegionCode>("east");
  const [resource, setResource] = useState<Resource<InventorySnapshot>>({ state: "loading" });
  const [classFilter, setClassFilter] = useState<string>("all");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"detect" | "manual" | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [manualClass, setManualClass] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [detectClass, setDetectClass] = useState("");
  const [detection, setDetection] = useState<DetectionView | null>(null);
  const [formError, setFormError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const regionRef = useRef(region);
  const snapshotRef = useRef<InventorySnapshot | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  regionRef.current = region;
  snapshotRef.current = resource.data;
  streamRef.current = stream;

  const stopCamera = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const closeAdd = useCallback(() => {
    stopCamera();
    setAddOpen(false);
    setAddMode(null);
    setDetecting(false);
    setCameraError("");
    setFormError("");
    setManualClass("");
    setManualItem("");
    setManualQuantity("");
    setDetectClass("");
    setDetection(null);
  }, [stopCamera]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
  }, [addOpen, closeAdd]);

  useEffect(() => {
    let active = true;
    setResource({ state: "loading" });
    api.inventory(region)
      .then((data) => {
        if (active) setResource({ state: "ready", data });
      })
      .catch((reason: unknown) => {
        if (active) setResource({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [region]);

  const classes = useMemo(() => {
    const rows = resource.data?.classes ?? [];
    return [...rows].sort((left, right) => classRank(left.code) - classRank(right.code));
  }, [resource.data]);

  const rows = useMemo<StockRow[]>(() => {
    return classes.flatMap((row) => {
      const capacity = classCapacity(row);
      return row.items.map((item) => ({
        key: `${row.code}:${item.code ?? "fund"}`,
        name: item.name,
        itemCode: item.code,
        classCode: row.code,
        className: row.name,
        quantity: item.quantity,
        unit: item.unit,
        status: statusFor(item.quantity, capacity),
        fill: displayPercent(item.quantity, capacity),
      }));
    });
  }, [classes]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = rows.filter((item) => {
      if (classFilter !== "all" && item.classCode !== classFilter) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!search) return true;
      return `${item.name} ${item.className} ${item.unit}`.toLowerCase().includes(search);
    });
    if (!sortKey) return filtered;
    const statusRank = STATUS_RANK;
    return [...filtered].sort((left, right) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "quantity") return (left.quantity - right.quantity) * dir;
      if (sortKey === "status") return (statusRank[left.status] - statusRank[right.status]) * dir;
      if (sortKey === "category") return left.className.localeCompare(right.className) * dir;
      return left.name.localeCompare(right.name) * dir;
    });
  }, [rows, classFilter, status, query, sortKey, sortAsc]);

  const movements = resource.data?.movements ?? [];
  const shownUpdates = showAllUpdates ? movements : movements.slice(0, 4);
  const goods = classes.filter((row) => row.code !== "fund");
  const totalQuantity = goods.reduce((sum, row) => sum + row.quantity, 0);
  const totalCapacity = goods.reduce((sum, row) => sum + classCapacity(row), 0) || CLASS_CAPACITY * 3;
  const totalStatus = statusFor(totalQuantity, totalCapacity);
  const totalFill = displayPercent(totalQuantity, totalCapacity);
  const restock = [
    ...(fillRatio(totalQuantity, totalCapacity) < 30
      ? [{ key: "total", name: "Total items", classCode: "total", status: totalStatus, fill: totalFill }]
      : []),
    ...classes
      .filter((row) => fillRatio(row.quantity, classCapacity(row)) < 30)
      .map((row) => ({
        key: row.code,
        name: row.name,
        classCode: row.code,
        status: statusFor(row.quantity, classCapacity(row)),
        fill: displayPercent(row.quantity, classCapacity(row)),
      })),
  ];
  const manualSelected = classes.find((row) => row.code === manualClass);
  const manualIsFund = manualSelected?.code === "fund" || manualSelected?.entry_mode === "manual_only";
  const detectClasses = classes.filter((row) => row.code !== "fund" && row.entry_mode !== "manual_only");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((current) => !current);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const applySnapshot = (data: InventorySnapshot, requested: RegionCode) => {
    if (regionRef.current === requested) setResource({ state: "ready", data });
  };

  const submitManual = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    if (!manualSelected) {
      setFormError("Choose a class.");
      return;
    }
    if (!manualIsFund && !manualItem) {
      setFormError("Choose a subclass.");
      return;
    }
    const quantity = Number(manualQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }
    const cap = classCapacity(manualSelected);
    if (manualSelected.quantity + quantity > cap) {
      setFormError(`${manualSelected.name} is limited to ${cap.toLocaleString()}.`);
      return;
    }
    const requested = region;
    setSaving(true);
    try {
      const saved = await api.addInventory(requested, {
        category_code: manualSelected.code,
        item_code: manualIsFund ? null : manualItem,
        quantity,
        entry_mode: "manual",
        direction: "in",
      });
      applySnapshot(saved, requested);
      closeAdd();
    } catch (reason) {
      setFormError(errorText(reason));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const startDetect = async () => {
    setFormError("");
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser has no camera.");
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setStream(next);
    } catch {
      setCameraError("Camera permission was blocked.");
    }
  };

  const runDetect = async () => {
    setFormError("");
    setCameraError("");
    if (!detectClass) {
      setFormError("Choose a class.");
      return;
    }
    const video = videoRef.current;
    if (!video) {
      setFormError("Start the camera before detecting an object.");
      return;
    }
    setDetecting(true);
    setDetection(null);
    try {
      if (!video.videoWidth) await video.play().catch(() => undefined);
      const image = await captureFrame(video);
      const result = await api.detectInventory(detectClass, image);
      const label = subclassLabel(snapshotRef.current, result.category_code, result.item_code);
      if (!mounted.current) return;
      setDetection({
        category_code: result.category_code,
        item_code: result.item_code,
        quantity: result.quantity,
        name: label.name,
        unit: label.unit,
      });
    } catch (reason) {
      if (mounted.current) {
        setDetection(null);
        setFormError(errorText(reason));
      }
    } finally {
      if (mounted.current) setDetecting(false);
    }
  };

  const confirmDetection = async () => {
    if (!detection || saving) return;
    setFormError("");
    const selected = classes.find((row) => row.code === detection.category_code);
    if (selected) {
      const cap = classCapacity(selected);
      if (selected.quantity + detection.quantity > cap) {
        setFormError(`${selected.name} is limited to ${cap.toLocaleString()}.`);
        return;
      }
    }
    const requested = region;
    setSaving(true);
    try {
      const saved = await api.addInventory(requested, {
        category_code: detection.category_code,
        item_code: detection.item_code,
        quantity: detection.quantity,
        entry_mode: "scan",
        direction: "in",
      });
      applySnapshot(saved, requested);
      closeAdd();
    } catch (reason) {
      setFormError(errorText(reason));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

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
            <span className="sr-only">Search items, classes, or locations</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16.5 20 20.5" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items, classes, or locations..."
              type="search"
            />
          </label>
          <button
            type="button"
            className="add-launch"
            onClick={() => setAddOpen(true)}
            disabled={resource.state !== "ready"}
          >
            + Add Item
          </button>
        </div>
      </header>

      {resource.state === "loading" && <p className="state">Loading inventory…</p>}
      {resource.state === "error" && (
        <p className="state error" role="alert">Inventory unavailable: {resource.error}</p>
      )}

      {resource.state === "ready" && (
        <section className="inv-stats" aria-label="Inventory totals">
          <article className="stat-card tone-total">
            <span className="stat-icon" aria-hidden="true"><TotalItemsIcon /></span>
            <div>
              <p>Total items</p>
              <strong>{totalQuantity.toLocaleString()}</strong>
              <small>{totalStatus} · {totalFill}% of capacity</small>
            </div>
          </article>
          {classes.map((row) => {
            const capacity = classCapacity(row);
            const cardStatus = statusFor(row.quantity, capacity);
            const fill = displayPercent(row.quantity, capacity);
            return (
              <article key={row.code} className={`stat-card ${toneClass(row.code)}`}>
                <span className="stat-icon" aria-hidden="true">
                  <ClassGlyph classCode={row.code} />
                </span>
                <div>
                  <p>{row.name}</p>
                  <strong>{row.quantity.toLocaleString()}</strong>
                  <small>{cardStatus} · {fill}% of capacity</small>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <div className="inv-layout">
        <section className="inv-table-card">
          <div className="inv-filters">
            <label>
              Location
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value as RegionCode);
                  setResource({ state: "loading" });
                  setShowAllUpdates(false);
                }}
              >
                {LOCATIONS.map((place) => (
                  <option key={place.region} value={place.region}>{place.label}</option>
                ))}
              </select>
            </label>
            <label>
              Class
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="all">All Classes</option>
                {classes.map((row) => (
                  <option key={row.code} value={row.code}>{row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StockStatus | "all")}
              >
                <option value="all">All Status</option>
                <option value="Out of Stock">Out of Stock</option>
                <option value="Critical">Critical</option>
                <option value="Low Stock">Low Stock</option>
                <option value="In Stock">In Stock</option>
                <option value="Full">Full</option>
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
                <button type="button" onClick={() => toggleSort("category")}>Class</button>
              </span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("quantity")}>Quantity</button>
              </span>
              <span role="columnheader">
                <button type="button" onClick={() => toggleSort("status")}>Status</button>
              </span>
            </div>
            {resource.state === "ready" && visible.length === 0 && (
              <p className="inv-empty">No items match these filters.</p>
            )}
            {visible.map((item, index) => (
              <div className="inv-row" role="row" key={item.key}>
                <span>{index + 1}</span>
                <span className="item-name">
                  <ItemGlyph itemCode={item.itemCode} />
                  {item.name}
                </span>
                <span className="class-cell">
                  <ClassGlyph classCode={item.classCode} compact />
                  <em className={`cat-pill ${pillClass(item.classCode)}`}>{item.className}</em>
                </span>
                <span>{item.quantity.toLocaleString()} {unitLabel(item.unit)}</span>
                <span>
                  <em
                    className={`stock-pill stock-${statusSlug(item.status)}`}
                    title={`${item.name} is ${item.fill}% of the ${item.className} capacity`}
                  >
                    {item.status}
                  </em>
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="inv-rail">
          <section className="rail-card alert-card">
            <header>
              <h2>Restock</h2>
              <b>{restock.length}</b>
            </header>
            {restock.length === 0 && <p className="rail-empty">No class is below 30%.</p>}
            <ul>
              {restock.map((item) => (
                <li key={item.key}>
                  {item.classCode === "total"
                    ? <TotalItemsIcon compact />
                    : <ClassGlyph classCode={item.classCode} compact />}
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.status} · {item.fill}% of capacity</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="rail-card">
            <header>
              <h2>Recent Stock Updates</h2>
              {movements.length > 4 && (
                <button type="button" className="text-link" onClick={() => setShowAllUpdates((current) => !current)}>
                  {showAllUpdates ? "Show less" : "View All"}
                </button>
              )}
            </header>
            {resource.state === "loading" && <p className="rail-empty">Loading stock updates…</p>}
            {resource.state === "error" && <p className="rail-empty">Stock updates are unavailable.</p>}
            {resource.state === "ready" && movements.length === 0 && (
              <p className="rail-empty">No stock updates for this location.</p>
            )}
            <ul className="update-list">
              {shownUpdates.map((update) => {
                const signed = update.direction === "out" ? -update.quantity : update.quantity;
                const positive = update.direction === "in";
                const change = `${signed > 0 ? "+" : ""}${signed.toLocaleString()} ${unitLabel(update.unit)}`;
                return (
                  <li key={update.id}>
                    <span className={positive ? "up" : "down"} aria-hidden="true">{positive ? "+" : "−"}</span>
                    <div>
                      <strong>{update.name}</strong>
                      <em className={positive ? "up" : "down"}>{change}</em>
                      <small>{formatWhen(update.created_at)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
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
            className={addMode === null ? "inv-modal" : "inv-modal is-single"}
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
            {addMode === null && (
              <div className="add-grid">
                <button type="button" className="add-card add-choice" onClick={() => setAddMode("detect")}>
                  <span className="choice-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M12 9v6M9 12h6" /></svg>
                  </span>
                  <h3>Detect Object</h3>
                  <p>Use the camera on clothes, foods, or utility.</p>
                </button>
                <button type="button" className="add-card add-choice" onClick={() => setAddMode("manual")}>
                  <span className="choice-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
                  </span>
                  <h3>Manual Add</h3>
                  <p>Type the class, subclass, and quantity. Fund is only here.</p>
                </button>
              </div>
            )}
            {addMode !== null && (
            <div className="add-grid single">
              <section className="add-card">
                <button type="button" className="text-link" onClick={() => { stopCamera(); setAddMode(null); setFormError(""); }}>
                  Choose another way
                </button>
                {addMode === "detect" && (
                <>
                <h3>Detect Object</h3>
                <p>Use the camera on clothes, foods, or utility. Stock is saved only after you confirm.</p>
                <label>
                  Class
                  <select
                    value={detectClass}
                    onChange={(event) => {
                      setDetectClass(event.target.value);
                      setDetection(null);
                      setFormError("");
                    }}
                  >
                    <option value="">Select class</option>
                    {detectClasses.map((row) => (
                      <option key={row.code} value={row.code}>{row.name}</option>
                    ))}
                  </select>
                </label>
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
                {detection && detectClass === detection.category_code && (
                  <div>
                    <p>Subclass <strong>{detection.name}</strong></p>
                    <p>
                      Quantity{" "}
                      <strong>
                        {detection.quantity.toLocaleString()}
                        {detection.unit ? ` ${unitLabel(detection.unit)}` : ""}
                      </strong>
                    </p>
                    <button type="button" onClick={() => void confirmDetection()} disabled={saving || detecting}>
                      {saving ? "Saving…" : "Save detected item"}
                    </button>
                  </div>
                )}
                {stream ? (
                  <button type="button" onClick={() => void runDetect()} disabled={detecting || saving}>
                    {detecting ? "Detecting…" : "Detect Object"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void startDetect()}>
                    Start camera
                  </button>
                )}
                </>
                )}
                {addMode === "manual" && (
                <>
                <h3>Manual Add</h3>
                <p>Enter a class and quantity. Fund has no subclass.</p>
                <form onSubmit={(event) => void submitManual(event)} noValidate>
                  <label>
                    Class
                    <select
                      value={manualClass}
                      onChange={(event) => {
                        setManualClass(event.target.value);
                        setManualItem("");
                      }}
                    >
                      <option value="">Select class</option>
                      {classes.map((row) => (
                        <option key={row.code} value={row.code}>{row.name}</option>
                      ))}
                    </select>
                  </label>
                  {manualSelected && !manualIsFund && (
                    <label>
                      Subclass
                      <select value={manualItem} onChange={(event) => setManualItem(event.target.value)}>
                        <option value="">Select subclass</option>
                        {manualSelected.items.filter((item) => item.code).map((item) => (
                          <option key={item.code} value={item.code ?? ""}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualQuantity}
                      onChange={(event) => setManualQuantity(event.target.value)}
                      placeholder="Enter quantity"
                    />
                  </label>
                  <button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Add Item"}
                  </button>
                </form>
                </>
                )}
              </section>
            </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
