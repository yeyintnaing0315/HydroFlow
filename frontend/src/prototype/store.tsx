import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ALLOC_TABS,
  cloneStocks,
  defaultAllocate,
  DEPOT_LABEL,
  districtById,
  HISTORY,
  HORIZON,
  INITIAL_STOCKS,
  itemInTab,
  NEEDED_BY,
  needFor,
  PAGE_TITLE,
  stockStatus,
  townshipById,
  type AllocTab,
  type DataView,
  type DepotId,
  type HistoryRow,
  type PageId,
  type StockItem,
} from "./data";

export interface Selection {
  townshipId: string;
  date: string;
  horizon: typeof HORIZON;
  depot: DepotId;
}

export interface PredictionView {
  townshipId: string;
  date: string;
  horizon: typeof HORIZON;
  probability: number;
  risk: HistoryRow["risk"];
  households: number;
  people: number;
  official: boolean;
  observed: boolean;
  heuristic: HistoryRow["heuristic"];
  source: "current" | "history";
}

export interface AllocationLine {
  item: StockItem;
  need: number;
  available: number;
  willAllocate: number;
  status: ReturnType<typeof stockStatus>;
}

interface StoreValue {
  page: PageId;
  pageTitle: string;
  setPage: (page: PageId) => void;
  selection: Selection;
  townshipName: string;
  districtName: string;
  depotLabel: string;
  setTownship: (townshipId: string) => void;
  setDistrict: (districtId: string) => void;
  setDate: (date: string) => void;
  setDepot: (depot: DepotId) => void;
  dataView: DataView;
  setDataView: (view: DataView) => void;
  retry: () => void;
  mapDistrictId: string;
  setMapDistrictId: (districtId: string) => void;
  prediction: PredictionView;
  loadHistory: (historyId: string) => void;
  activeHistoryId: string | null;
  category: AllocTab;
  setCategory: (tab: AllocTab) => void;
  focusItemId: string | null;
  lines: AllocationLine[];
  visibleLines: AllocationLine[];
  overAllocated: boolean;
  setWillAllocate: (itemId: string, quantity: number) => void;
  planResources: () => void;
  openAllocationForItem: (itemId: string) => void;
  dialogOpen: boolean;
  openConfirm: () => void;
  closeConfirm: () => void;
  canConfirm: boolean;
  confirmAllocation: () => void;
  toastOpen: boolean;
  dismissToast: () => void;
  viewInventoryFromToast: () => void;
  neededTownships: (itemId: string) => string[];
  stocksForDepot: StockItem[];
}

const StoreContext = createContext<StoreValue | null>(null);

const INITIAL_SELECTION: Selection = {
  townshipId: "nyaunglebin",
  date: "2026-10-16",
  horizon: HORIZON,
  depot: "east",
};

function predictionFromTownship(selection: Selection): PredictionView {
  const township = townshipById(selection.townshipId);
  return {
    townshipId: township.id,
    date: selection.date,
    horizon: selection.horizon,
    probability: township.probability,
    risk: township.risk,
    households: township.households,
    people: township.people,
    official: township.official,
    observed: township.observed,
    heuristic: township.heuristic,
    source: "current",
  };
}

function predictionFromHistory(row: HistoryRow): PredictionView {
  return {
    townshipId: row.townshipId,
    date: row.date,
    horizon: row.horizon,
    probability: row.probability,
    risk: row.risk,
    households: row.households,
    people: row.people,
    official: row.official,
    observed: row.observed,
    heuristic: row.heuristic,
    source: "history",
  };
}

export function PrototypeStore({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>("home");
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);
  const [dataView, setDataView] = useState<DataView>("ready");
  const [mapDistrictId, setMapDistrictId] = useState(townshipById(INITIAL_SELECTION.townshipId).districtId);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [stocks, setStocks] = useState(() => cloneStocks(INITIAL_STOCKS));
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<AllocTab>("food");
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<{ itemId: string; townshipId: string }[]>([]);

  const districtId = townshipById(selection.townshipId).districtId;

  useEffect(() => {
    setMapDistrictId(districtId);
  }, [districtId]);

  const prediction = useMemo(() => {
    const row = HISTORY.find((item) => item.id === historyId);
    if (row && row.townshipId === selection.townshipId && row.date === selection.date) {
      return predictionFromHistory(row);
    }
    return predictionFromTownship(selection);
  }, [historyId, selection]);

  const lines = useMemo<AllocationLine[]>(() => {
    return stocks[selection.depot].map((item) => {
      const need = needFor(item.id, prediction.people, prediction.households);
      const available = item.quantity;
      const key = `${selection.townshipId}|${selection.depot}|${item.id}`;
      const willAllocate = key in draft ? draft[key] : defaultAllocate(need, available, item.lowAt);
      return {
        item,
        need,
        available,
        willAllocate,
        status: stockStatus(item.quantity, item.lowAt),
      };
    });
  }, [draft, prediction.households, prediction.people, selection.depot, selection.townshipId, stocks]);

  const visibleLines = lines.filter((line) => itemInTab(line.item.category, category));
  const overAllocated = lines.some((line) => line.willAllocate > line.available);
  const canConfirm = !overAllocated && lines.some((line) => line.willAllocate > 0);

  const setTownship = (townshipId: string) => {
    setHistoryId(null);
    setFocusItemId(null);
    setSelection((current) => ({ ...current, townshipId }));
  };

  const setDistrict = (nextDistrictId: string) => {
    const first = townshipById(
      districtById(nextDistrictId).id === "nyaunglebin"
        ? "nyaunglebin"
        : townshipById(selection.townshipId).districtId === nextDistrictId
          ? selection.townshipId
          : "",
    );
    const match = first.districtId === nextDistrictId ? first.id : townshipListFirst(nextDistrictId);
    setHistoryId(null);
    setFocusItemId(null);
    setMapDistrictId(nextDistrictId);
    setSelection((current) => ({ ...current, townshipId: match }));
  };

  const value: StoreValue = {
    page,
    pageTitle: PAGE_TITLE[page],
    setPage,
    selection,
    townshipName: townshipById(selection.townshipId).name,
    districtName: districtById(districtId).name,
    depotLabel: DEPOT_LABEL[selection.depot],
    setTownship,
    setDistrict,
    setDate: (date) => {
      setHistoryId(null);
      setSelection((current) => ({ ...current, date }));
    },
    setDepot: (depot) => setSelection((current) => ({ ...current, depot })),
    dataView,
    setDataView,
    retry: () => setDataView("ready"),
    mapDistrictId,
    setMapDistrictId,
    prediction,
    loadHistory: (nextHistoryId) => {
      const row = HISTORY.find((item) => item.id === nextHistoryId);
      if (!row) return;
      setHistoryId(row.id);
      setFocusItemId(null);
      setSelection((current) => ({
        ...current,
        townshipId: row.townshipId,
        date: row.date,
        horizon: row.horizon,
      }));
      setPage("prediction");
    },
    activeHistoryId: historyId,
    category,
    setCategory,
    focusItemId,
    lines,
    visibleLines,
    overAllocated,
    setWillAllocate: (itemId, quantity) => {
      const key = `${selection.townshipId}|${selection.depot}|${itemId}`;
      setDraft((current) => ({ ...current, [key]: Math.max(0, quantity) }));
    },
    planResources: () => {
      setFocusItemId(null);
      setPage("allocation");
    },
    openAllocationForItem: (itemId) => {
      const item = stocks[selection.depot].find((entry) => entry.id === itemId);
      const tab = ALLOC_TABS.find((entry) => item && itemInTab(item.category, entry.id))?.id ?? "food";
      setCategory(tab);
      setFocusItemId(itemId);
      setPage("allocation");
    },
    dialogOpen,
    openConfirm: () => setDialogOpen(true),
    closeConfirm: () => setDialogOpen(false),
    canConfirm,
    confirmAllocation: () => {
      if (!canConfirm) return;
      const applied = lines.filter((line) => line.willAllocate > 0);
      setStocks((current) => ({
        ...current,
        [selection.depot]: current[selection.depot].map((item) => {
          const line = applied.find((entry) => entry.item.id === item.id);
          if (!line) return item;
          return {
            ...item,
            quantity: Math.max(0, item.quantity - line.willAllocate),
            reserved: item.reserved + line.willAllocate,
          };
        }),
      }));
      setConfirmed((current) => [
        ...current,
        ...applied.map((line) => ({ itemId: line.item.id, townshipId: selection.townshipId })),
      ]);
      setDraft((current) => {
        const next = { ...current };
        for (const line of lines) {
          delete next[`${selection.townshipId}|${selection.depot}|${line.item.id}`];
        }
        return next;
      });
      setDialogOpen(false);
      setToastOpen(true);
    },
    toastOpen,
    dismissToast: () => setToastOpen(false),
    viewInventoryFromToast: () => {
      setToastOpen(false);
      setPage("inventory");
    },
    neededTownships: (itemId) => {
      const ids = new Set(NEEDED_BY[itemId] ?? []);
      for (const entry of confirmed) {
        if (entry.itemId === itemId) ids.add(entry.townshipId);
      }
      return [...ids];
    },
    stocksForDepot: stocks[selection.depot],
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function townshipListFirst(districtId: string): string {
  const found = districtById(districtId);
  const first = found ? townshipById(found.id === districtId ? districtId : "") : undefined;
  const list = districtId;
  const match = list && first && first.districtId === districtId ? first.id : "";
  return match || fallbackTownship(districtId);
}

function fallbackTownship(districtId: string): string {
  const table: Record<string, string> = {
    bago: "bago",
    nyaunglebin: "nyaunglebin",
    taungoo: "taungoo",
    thayarwady: "thayarwady",
    nattalin: "nattalin",
    pyay: "pyay",
  };
  return table[districtId] ?? "nyaunglebin";
}

export function usePrototype(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("usePrototype must be used inside PrototypeStore");
  return value;
}
