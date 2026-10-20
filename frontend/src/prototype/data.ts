export type PageId = "home" | "prediction" | "allocation" | "inventory";
export type RiskLevel = "low" | "moderate" | "high" | "very-high";
export type Status = "good" | "low" | "out";
export type DepotId = "east" | "west";
export type DataView = "ready" | "loading" | "empty" | "error" | "stale";
export type ItemCategory = "food" | "clothes" | "utensils" | "fans";
export type AllocTab = "food" | "clothes" | "utensils";

export const LAST_UPDATED = "16 Oct 2026, 06:12 AM";
export const HORIZON = "1-week" as const;

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  "very-high": "Very high",
};

export const STATUS_LABEL: Record<Status, string> = {
  good: "Good",
  low: "Low",
  out: "Out of stock",
};

export const DEPOT_LABEL: Record<DepotId, string> = {
  east: "Bago (East)",
  west: "Bago (West)",
};

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  "very-high": 3,
};

export interface District {
  id: string;
  name: string;
  nameLocal: string;
}

export interface Township {
  id: string;
  name: string;
  nameLocal: string;
  districtId: string;
  probability: number;
  risk: RiskLevel;
  households: number;
  people: number;
  official: boolean;
  observed: boolean;
  heuristic: RiskLevel;
  x: number;
  y: number;
}

export interface HistoryRow {
  id: string;
  date: string;
  townshipId: string;
  horizon: typeof HORIZON;
  probability: number;
  risk: RiskLevel;
  households: number;
  people: number;
  official: boolean;
  observed: boolean;
  heuristic: RiskLevel;
}

export interface StockItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  reserved: number;
  lowAt: number;
}

export const DISTRICTS: District[] = [
  { id: "taungoo", name: "Taungoo", nameLocal: "တောင်ငူ" },
  { id: "pyay", name: "Pyay", nameLocal: "ပြည်" },
  { id: "nyaunglebin", name: "Nyaunglebin", nameLocal: "ညောင်လေးပင်" },
  { id: "thayarwady", name: "Thayarwady", nameLocal: "သာယာဝတီ" },
  { id: "bago", name: "Bago", nameLocal: "ပဲခူး" },
  { id: "nattalin", name: "Nattalin", nameLocal: "နတ်တလင်း" },
];

export const TOWNSHIPS: Township[] = [
  { id: "taungoo", name: "Taungoo", nameLocal: "တောင်ငူ", districtId: "taungoo", probability: 0.31, risk: "moderate", households: 2100, people: 9240, official: false, observed: false, heuristic: "moderate", x: 230, y: 36 },
  { id: "yedashe", name: "Yedashe", nameLocal: "ရေတာရှည်", districtId: "taungoo", probability: 0.14, risk: "low", households: 980, people: 4310, official: false, observed: false, heuristic: "low", x: 268, y: 58 },
  { id: "oktwin", name: "Oktwin", nameLocal: "အုတ်တွင်း", districtId: "taungoo", probability: 0.28, risk: "moderate", households: 1240, people: 5460, official: false, observed: false, heuristic: "low", x: 210, y: 64 },
  { id: "pyu", name: "Pyu", nameLocal: "ဖြူး", districtId: "taungoo", probability: 0.19, risk: "low", households: 1560, people: 6860, official: false, observed: false, heuristic: "moderate", x: 250, y: 84 },
  { id: "nyaunglebin", name: "Nyaunglebin", nameLocal: "ညောင်လေးပင်", districtId: "nyaunglebin", probability: 0.74, risk: "very-high", households: 4210, people: 18420, official: true, observed: true, heuristic: "high", x: 236, y: 108 },
  { id: "kyauktaga", name: "Kyauktaga", nameLocal: "ကျောက်တံခါး", districtId: "nyaunglebin", probability: 0.57, risk: "high", households: 2680, people: 11790, official: true, observed: false, heuristic: "high", x: 274, y: 124 },
  { id: "shwegyin", name: "Shwegyin", nameLocal: "ရွှေကျင်", districtId: "nyaunglebin", probability: 0.33, risk: "moderate", households: 1420, people: 6250, official: false, observed: false, heuristic: "moderate", x: 300, y: 96 },
  { id: "daik-u", name: "Daik-U", nameLocal: "ဒိုက်ဦး", districtId: "nyaunglebin", probability: 0.51, risk: "high", households: 1890, people: 8320, official: true, observed: false, heuristic: "moderate", x: 248, y: 140 },
  { id: "bago", name: "Bago", nameLocal: "ပဲခူး", districtId: "bago", probability: 0.58, risk: "high", households: 5120, people: 22530, official: true, observed: false, heuristic: "high", x: 220, y: 168 },
  { id: "kawa", name: "Kawa", nameLocal: "ကဝ", districtId: "bago", probability: 0.36, risk: "moderate", households: 1760, people: 7740, official: false, observed: false, heuristic: "moderate", x: 262, y: 188 },
  { id: "thanatpin", name: "Thanatpin", nameLocal: "သနပ်ပင်", districtId: "bago", probability: 0.62, risk: "high", households: 2340, people: 10300, official: true, observed: true, heuristic: "high", x: 198, y: 196 },
  { id: "waw", name: "Waw", nameLocal: "ဝေါ", districtId: "bago", probability: 0.12, risk: "low", households: 890, people: 3920, official: false, observed: false, heuristic: "low", x: 250, y: 214 },
  { id: "pyay", name: "Pyay", nameLocal: "ပြည်", districtId: "pyay", probability: 0.15, risk: "low", households: 3480, people: 15310, official: false, observed: false, heuristic: "low", x: 78, y: 150 },
  { id: "paukkaung", name: "Paukkaung", nameLocal: "ပေါက်ခေါင်း", districtId: "pyay", probability: 0.13, risk: "low", households: 1120, people: 4930, official: false, observed: false, heuristic: "moderate", x: 48, y: 176 },
  { id: "padaung", name: "Padaung", nameLocal: "ပန်းတောင်း", districtId: "pyay", probability: 0.3, risk: "moderate", households: 1310, people: 5760, official: false, observed: false, heuristic: "moderate", x: 108, y: 186 },
  { id: "shwedaung", name: "Shwedaung", nameLocal: "ရွှေတောင်", districtId: "pyay", probability: 0.17, risk: "low", households: 980, people: 4310, official: false, observed: false, heuristic: "low", x: 72, y: 204 },
  { id: "thayarwady", name: "Thayarwady", nameLocal: "သာယာဝတီ", districtId: "thayarwady", probability: 0.49, risk: "high", households: 2760, people: 12140, official: true, observed: false, heuristic: "moderate", x: 86, y: 92 },
  { id: "letpadan", name: "Letpadan", nameLocal: "လက်ပံတန်း", districtId: "thayarwady", probability: 0.35, risk: "moderate", households: 1640, people: 7220, official: false, observed: true, heuristic: "moderate", x: 46, y: 112 },
  { id: "minhla", name: "Minhla", nameLocal: "မင်းလှ", districtId: "thayarwady", probability: 0.16, risk: "low", households: 740, people: 3260, official: false, observed: false, heuristic: "low", x: 112, y: 72 },
  { id: "monyo", name: "Monyo", nameLocal: "မိုးညို", districtId: "thayarwady", probability: 0.29, risk: "moderate", households: 1010, people: 4440, official: false, observed: false, heuristic: "low", x: 118, y: 118 },
  { id: "nattalin", name: "Nattalin", nameLocal: "နတ်တလင်း", districtId: "nattalin", probability: 0.27, risk: "moderate", households: 1180, people: 5190, official: false, observed: false, heuristic: "moderate", x: 132, y: 168 },
  { id: "zigon", name: "Zigon", nameLocal: "ဇီးကုန်း", districtId: "nattalin", probability: 0.11, risk: "low", households: 640, people: 2820, official: false, observed: false, heuristic: "low", x: 96, y: 214 },
  { id: "paungde", name: "Paungde", nameLocal: "ပေါင်းတည်", districtId: "nattalin", probability: 0.18, risk: "low", households: 870, people: 3830, official: false, observed: false, heuristic: "low", x: 150, y: 214 },
  { id: "thegon", name: "Thegon", nameLocal: "သဲကုန်း", districtId: "nattalin", probability: 0.32, risk: "moderate", households: 1090, people: 4800, official: false, observed: false, heuristic: "moderate", x: 168, y: 186 },
];

export const HISTORY: HistoryRow[] = [
  { id: "h1", date: "2026-10-16", townshipId: "nyaunglebin", horizon: HORIZON, probability: 0.74, risk: "very-high", households: 4210, people: 18420, official: true, observed: true, heuristic: "high" },
  { id: "h2", date: "2026-10-09", townshipId: "bago", horizon: HORIZON, probability: 0.61, risk: "high", households: 4980, people: 21910, official: true, observed: false, heuristic: "high" },
  { id: "h3", date: "2026-10-02", townshipId: "taungoo", horizon: HORIZON, probability: 0.34, risk: "moderate", households: 2060, people: 9060, official: false, observed: false, heuristic: "moderate" },
  { id: "h4", date: "2026-09-25", townshipId: "pyay", horizon: HORIZON, probability: 0.18, risk: "low", households: 3220, people: 14170, official: false, observed: false, heuristic: "low" },
  { id: "h5", date: "2026-09-18", townshipId: "kyauktaga", horizon: HORIZON, probability: 0.55, risk: "high", households: 2510, people: 11040, official: true, observed: false, heuristic: "moderate" },
];

const EAST: StockItem[] = [
  { id: "rice", name: "Rice (kg)", category: "food", quantity: 2500, reserved: 0, lowAt: 800 },
  { id: "noodles", name: "Instant noodles (box)", category: "food", quantity: 180, reserved: 0, lowAt: 400 },
  { id: "oil", name: "Cooking oil (L)", category: "food", quantity: 0, reserved: 0, lowAt: 100 },
  { id: "water", name: "Drinking water (L)", category: "food", quantity: 1200, reserved: 0, lowAt: 500 },
  { id: "blankets", name: "Blankets (pcs)", category: "clothes", quantity: 450, reserved: 0, lowAt: 200 },
  { id: "clothes", name: "Clothing sets (pcs)", category: "clothes", quantity: 320, reserved: 0, lowAt: 150 },
  { id: "pots", name: "Cooking pots (pcs)", category: "utensils", quantity: 140, reserved: 0, lowAt: 80 },
  { id: "plates", name: "Plate sets (pcs)", category: "utensils", quantity: 90, reserved: 0, lowAt: 120 },
  { id: "fans", name: "Fans (units)", category: "fans", quantity: 15, reserved: 0, lowAt: 40 },
];

const WEST: StockItem[] = [
  { id: "rice", name: "Rice (kg)", category: "food", quantity: 900, reserved: 0, lowAt: 800 },
  { id: "noodles", name: "Instant noodles (box)", category: "food", quantity: 860, reserved: 0, lowAt: 400 },
  { id: "oil", name: "Cooking oil (L)", category: "food", quantity: 220, reserved: 0, lowAt: 100 },
  { id: "water", name: "Drinking water (L)", category: "food", quantity: 340, reserved: 0, lowAt: 500 },
  { id: "blankets", name: "Blankets (pcs)", category: "clothes", quantity: 80, reserved: 0, lowAt: 200 },
  { id: "clothes", name: "Clothing sets (pcs)", category: "clothes", quantity: 40, reserved: 0, lowAt: 150 },
  { id: "pots", name: "Cooking pots (pcs)", category: "utensils", quantity: 200, reserved: 0, lowAt: 80 },
  { id: "plates", name: "Plate sets (pcs)", category: "utensils", quantity: 300, reserved: 0, lowAt: 120 },
  { id: "fans", name: "Fans (units)", category: "fans", quantity: 0, reserved: 0, lowAt: 40 },
];

export const INITIAL_STOCKS: Record<DepotId, StockItem[]> = {
  east: EAST,
  west: WEST,
};

export const NEEDED_BY: Record<string, string[]> = {
  noodles: ["nyaunglebin", "kyauktaga"],
  plates: ["bago", "thanatpin"],
  fans: ["nyaunglebin", "daik-u"],
  oil: ["pyay", "paukkaung"],
};

export const PAGES: { id: PageId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "prediction", label: "Flood Prediction" },
  { id: "allocation", label: "Resource Allocation" },
  { id: "inventory", label: "Inventory Management" },
];

export const PAGE_TITLE: Record<PageId, string> = {
  home: "Home",
  prediction: "Flood Prediction",
  allocation: "Resource Allocation",
  inventory: "Inventory Management",
};

export const ALLOC_TABS: { id: AllocTab; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "clothes", label: "Clothes" },
  { id: "utensils", label: "Utensils and fans" },
];

export const DEPOT_POINT: Record<DepotId, { x: number; y: number }> = {
  east: { x: 168, y: 176 },
  west: { x: 128, y: 132 },
};

export function townshipById(id: string): Township {
  return TOWNSHIPS.find((item) => item.id === id) ?? TOWNSHIPS[4];
}

export function districtById(id: string): District {
  return DISTRICTS.find((item) => item.id === id) ?? DISTRICTS[2];
}

export function townshipsIn(districtId: string): Township[] {
  return TOWNSHIPS.filter((item) => item.districtId === districtId);
}

export function districtRisk(districtId: string): RiskLevel {
  const levels = townshipsIn(districtId).map((item) => item.risk);
  return levels.reduce((best, level) => (RISK_RANK[level] > RISK_RANK[best] ? level : best), "low");
}

export function stockStatus(quantity: number, lowAt: number): Status {
  if (quantity <= 0) return "out";
  if (quantity <= lowAt) return "low";
  return "good";
}

export function needFor(itemId: string, people: number, households: number): number {
  switch (itemId) {
    case "rice":
      return Math.round(people * 0.4 * 7);
    case "noodles":
      return households * 3;
    case "oil":
      return Math.round(households * 1.5);
    case "water":
      return people * 2 * 7;
    case "blankets":
      return households;
    case "clothes":
      return people;
    case "pots":
    case "plates":
      return households;
    case "fans":
      return Math.round(households * 0.2);
    default:
      return 0;
  }
}

export function defaultAllocate(need: number, available: number, lowAt: number): number {
  if (need <= 0 || available <= 0) return 0;
  const preferred = Math.max(0, available - Math.min(lowAt, available));
  if (preferred > 0) return Math.min(need, preferred);
  return Math.min(need, available);
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function itemInTab(category: ItemCategory, tab: AllocTab): boolean {
  if (tab === "utensils") return category === "utensils" || category === "fans";
  return category === tab;
}

export function cloneStocks(source: Record<DepotId, StockItem[]>): Record<DepotId, StockItem[]> {
  return {
    east: source.east.map((item) => ({ ...item })),
    west: source.west.map((item) => ({ ...item })),
  };
}
