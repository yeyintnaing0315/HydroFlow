import {
  ALLOC_TABS,
  DEPOT_POINT,
  districtById,
  districtRisk,
  DISTRICTS,
  formatCount,
  formatIsoDate,
  formatPercent,
  HISTORY,
  RISK_LABEL,
  stockStatus,
  townshipById,
  TOWNSHIPS,
  townshipsIn,
  type ItemCategory,
} from "./data";
import { usePrototype } from "./store";
import { DataBlock, RiskPill, StatusPill, Tabs, Toggle } from "./ui";

function ViewDetails({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="hf-btn" aria-label={label} onClick={onClick}>
      View details
    </button>
  );
}

export function HomePage() {
  const { prediction, lines, stocksForDepot, depotLabel, setPage, townshipName } = usePrototype();
  const short = lines.filter((line) => line.need > line.available);
  const lead = [...lines].sort((a, b) => b.need - b.available - (a.need - a.available))[0];
  const counts = {
    good: stocksForDepot.filter((item) => stockStatus(item.quantity, item.lowAt) === "good").length,
    low: stocksForDepot.filter((item) => stockStatus(item.quantity, item.lowAt) === "low").length,
    out: stocksForDepot.filter((item) => stockStatus(item.quantity, item.lowAt) === "out").length,
  };

  return (
    <div className="hf-stack">
      <DataBlock testId="home-kpis">
        <div className="hf-kpis">
          <article className="hf-kpi">
            <span>Overall flood risk</span>
            <RiskPill level={prediction.risk} />
            <small>{townshipName}</small>
          </article>
          <article className="hf-kpi">
            <span>Flood probability</span>
            <strong>{formatPercent(prediction.probability)}</strong>
            <small>Next 1 week</small>
          </article>
          <article className="hf-kpi">
            <span>People expected</span>
            <strong>{formatCount(prediction.people)}</strong>
            <small>{formatCount(prediction.households)} households</small>
          </article>
          <article className="hf-kpi">
            <span>Depot stock</span>
            <strong>
              {counts.low + counts.out} short
            </strong>
            <small>
              {depotLabel} · {counts.good} good
            </small>
          </article>
        </div>
      </DataBlock>

      <div className="hf-thirds">
        <DataBlock
          testId="home-prediction"
          eyebrow="1. Flood Prediction"
          title="Township indicator"
          action={<ViewDetails label="View flood prediction details" onClick={() => setPage("prediction")} />}
        >
          <p className="hf-local">{townshipById(prediction.townshipId).nameLocal}</p>
          <p className="hf-big-name">{townshipName}</p>
          <p className="hf-prob">{formatPercent(prediction.probability)}</p>
          <RiskPill level={prediction.risk} />
          <p className="hf-note">Probability that the model flags a flood in the selected week.</p>
        </DataBlock>

        <DataBlock
          testId="home-allocation"
          eyebrow="2. Resource Allocation"
          title="Need versus available"
          action={<ViewDetails label="View resource allocation details" onClick={() => setPage("allocation")} />}
        >
          <p className="hf-stat">
            <strong>{formatCount(prediction.people)}</strong>
            <span>people expected to need help</span>
          </p>
          <p className="hf-stat">
            <strong>{short.length}</strong>
            <span>items where need is above stock at {depotLabel}</span>
          </p>
          {lead && (
            <p className="hf-note">
              {lead.item.name}: need {formatCount(lead.need)} · available {formatCount(lead.available)}
            </p>
          )}
        </DataBlock>

        <DataBlock
          testId="home-inventory"
          eyebrow="3. Inventory Management"
          title={`Stock at ${depotLabel}`}
          action={<ViewDetails label="View inventory details" onClick={() => setPage("inventory")} />}
        >
          <ul className="hf-mini-stock">
            {stocksForDepot.slice(0, 4).map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <span>{formatCount(item.quantity)}</span>
                <StatusPill status={stockStatus(item.quantity, item.lowAt)} />
              </li>
            ))}
          </ul>
        </DataBlock>
      </div>
    </div>
  );
}

export function PredictionPage() {
  const {
    selection,
    setTownship,
    setDate,
    mapDistrictId,
    setMapDistrictId,
    prediction,
    planResources,
    loadHistory,
    activeHistoryId,
    townshipName,
  } = usePrototype();
  const mapDistrict = districtById(mapDistrictId);
  const listed = townshipsIn(mapDistrictId);

  return (
    <div className="hf-stack">
      <div className="hf-filters" aria-label="Prediction filters">
        <label>
          Date
          <input aria-label="Prediction date" type="date" value={selection.date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Township
          <select
            aria-label="Prediction township"
            value={selection.townshipId}
            onChange={(event) => setTownship(event.target.value)}
          >
            {DISTRICTS.map((district) => (
              <optgroup key={district.id} label={district.name}>
                {townshipsIn(district.id).map((township) => (
                  <option key={township.id} value={township.id}>
                    {township.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Horizon
          <select aria-label="Prediction horizon" value="1-week" onChange={() => undefined}>
            <option value="1-week">1 week</option>
          </select>
        </label>
      </div>

      <div className="hf-split">
        <DataBlock testId="district-map" eyebrow="ခရိုင်မြေပုံ" title="District map">
          <div className="hf-map" aria-label="Bago Region districts by risk">
            {DISTRICTS.map((district) => {
              const risk = districtRisk(district.id);
              const active = district.id === mapDistrictId;
              return (
                <button
                  key={district.id}
                  type="button"
                  className={`hf-block hf-block-${district.id} ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  aria-label={`${district.name} district, ${RISK_LABEL[risk]} risk`}
                  onClick={() => setMapDistrictId(district.id)}
                >
                  <span>{district.name}</span>
                  <small className="hf-local">{district.nameLocal}</small>
                  <RiskPill level={risk} />
                </button>
              );
            })}
          </div>
          <h3 className="hf-subhead">{mapDistrict.name} townships</h3>
          <ul className="hf-town-list">
            {listed.map((township) => (
              <li key={township.id}>
                <button
                  type="button"
                  className={township.id === selection.townshipId ? "is-active" : ""}
                  aria-pressed={township.id === selection.townshipId}
                  onClick={() => setTownship(township.id)}
                >
                  <span>
                    {township.name}
                    <small className="hf-local">{township.nameLocal}</small>
                  </span>
                  <RiskPill level={township.risk} />
                </button>
              </li>
            ))}
          </ul>
        </DataBlock>

        <DataBlock testId="prediction-result" eyebrow="ခန့်မှန်းချက်" title="Prediction result">
          <p className="hf-big-name">
            {townshipName}
            <small className="hf-local">{townshipById(prediction.townshipId).nameLocal}</small>
          </p>
          <p className="hf-prob" aria-label="Flood probability">
            {formatPercent(prediction.probability)}
          </p>
          <RiskPill level={prediction.risk} />
          <div className="hf-pair">
            <p>
              <span>Expected households</span>
              <strong>{formatCount(prediction.households)}</strong>
            </p>
            <p>
              <span>Expected people</span>
              <strong>{formatCount(prediction.people)}</strong>
            </p>
          </div>
          <div className="hf-chips">
            <div className="hf-chip is-on">
              <span>Model prediction</span>
              <strong>{formatPercent(prediction.probability)}</strong>
            </div>
            <div className={prediction.official ? "hf-chip is-on" : "hf-chip"}>
              <span>Official warning</span>
              <strong>{prediction.official ? "Issued" : "None"}</strong>
            </div>
            <div className={prediction.observed ? "hf-chip is-on" : "hf-chip"}>
              <span>Observed inundation</span>
              <strong>{prediction.observed ? "Observed" : "None"}</strong>
            </div>
            <div className="hf-chip is-on">
              <span>Heuristic risk</span>
              <strong>{RISK_LABEL[prediction.heuristic]}</strong>
            </div>
          </div>
          <p className="hf-limit">Model limits: test flood F1 is about 0.03. Use as an indicator only.</p>
          {prediction.source === "history" && (
            <p className="hf-note">Loaded from prediction history for {formatIsoDate(prediction.date)}.</p>
          )}
          <button type="button" className="hf-btn" onClick={planResources}>
            Plan resources for this township
          </button>
        </DataBlock>
      </div>

      <DataBlock testId="prediction-history" title="Prediction history">
        <div className="hf-table-wrap">
          <table className="hf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Township</th>
                <th>Horizon</th>
                <th>Probability</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {HISTORY.map((row) => {
                const name = townshipById(row.townshipId).name;
                return (
                  <tr
                    key={row.id}
                    className={row.id === activeHistoryId ? "is-active" : ""}
                    role="button"
                    tabIndex={0}
                    aria-label={`Load prediction for ${name} on ${row.date}`}
                    onClick={() => loadHistory(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        loadHistory(row.id);
                      }
                    }}
                  >
                    <td>{formatIsoDate(row.date)}</td>
                    <td>{name}</td>
                    <td>1 week</td>
                    <td>{formatPercent(row.probability)}</td>
                    <td>
                      <RiskPill level={row.risk} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataBlock>
    </div>
  );
}

export function AllocationPage() {
  const {
    prediction,
    depotLabel,
    selection,
    setDepot,
    category,
    setCategory,
    visibleLines,
    focusItemId,
    overAllocated,
    setWillAllocate,
    openConfirm,
    townshipName,
  } = usePrototype();
  const origin = DEPOT_POINT[selection.depot];
  const destination = townshipById(prediction.townshipId);

  return (
    <div className="hf-stack">
      <div className="hf-split">
        <DataBlock testId="route-card" title="Route">
          <div className="hf-route" aria-label={`Route from ${depotLabel} to ${townshipName}`}>
            <svg viewBox="0 0 320 240" role="img">
              <title>
                Depot {depotLabel} to {townshipName}
              </title>
              <path d="M20 30 C 80 80, 40 140, 90 200" className="hf-river" />
              <line x1={origin.x} y1={origin.y} x2={destination.x} y2={destination.y} className="hf-route-line" />
              <circle cx={origin.x} cy={origin.y} r="8" className="hf-depot-dot" />
              <circle cx={destination.x} cy={destination.y} r="8" className="hf-dest-dot" />
              <text x={origin.x + 12} y={origin.y + 4}>
                {depotLabel}
              </text>
              <text x={destination.x + 12} y={destination.y + 4}>
                {townshipName}
              </text>
            </svg>
            <ul className="hf-legend">
              <li>
                <i className="hf-depot-dot" /> Depot
              </li>
              <li>
                <i className="hf-dest-dot" /> Destination township
              </li>
              <li>
                <i className="hf-route-swatch" /> Planned line
              </li>
            </ul>
          </div>
        </DataBlock>

        <DataBlock testId="allocation-card" title="Resources to allocate">
          <div className="hf-pair">
            <p>
              <span>People expected to need help</span>
              <strong>{formatCount(prediction.people)}</strong>
            </p>
            <p>
              <span>Households</span>
              <strong>{formatCount(prediction.households)}</strong>
            </p>
          </div>
          <div className="hf-alloc-tools">
            <Tabs label="Resource category" value={category} options={ALLOC_TABS} onChange={setCategory} />
            <Toggle label="Allocation depot" value={selection.depot} onChange={setDepot} />
          </div>
          {overAllocated && (
            <p className="hf-warning" role="alert">
              Stock is lower than the amount to allocate. Reduce the highlighted rows to the available quantity.
            </p>
          )}
          <div className="hf-table-wrap">
            <table className="hf-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Need</th>
                  <th>Available</th>
                  <th>Will allocate</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line) => {
                  const over = line.willAllocate > line.available;
                  return (
                    <tr
                      key={line.item.id}
                      className={line.item.id === focusItemId ? "is-focus" : ""}
                      data-item={line.item.id}
                    >
                      <td>{line.item.name}</td>
                      <td>{formatCount(line.need)}</td>
                      <td>{formatCount(line.available)}</td>
                      <td>
                        <input
                          className="hf-qty"
                          aria-label={`Will allocate ${line.item.name}`}
                          aria-invalid={over}
                          type="number"
                          min={0}
                          step={1}
                          value={line.willAllocate}
                          onChange={(event) => setWillAllocate(line.item.id, Number(event.target.value))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="hf-btn" onClick={openConfirm}>
            Confirm allocation
          </button>
          <p className="hf-note">A coordinator confirms; nothing is sent automatically.</p>
        </DataBlock>
      </div>
    </div>
  );
}

const GROUPS: { id: "food" | "clothes" | "kit"; label: string; categories: ItemCategory[] }[] = [
  { id: "food", label: "Food", categories: ["food"] },
  { id: "clothes", label: "Clothes", categories: ["clothes"] },
  { id: "kit", label: "Utensils and fans", categories: ["utensils", "fans"] },
];

export function InventoryPage() {
  const { stocksForDepot, selection, setDepot, neededTownships, openAllocationForItem } = usePrototype();
  const sum = (categories: ItemCategory[]) =>
    stocksForDepot.filter((item) => categories.includes(item.category)).reduce((total, item) => total + item.quantity, 0);
  const kpis = [
    { label: "Total items", value: stocksForDepot.reduce((total, item) => total + item.quantity, 0) },
    { label: "Foods", value: sum(["food"]) },
    { label: "Clothes", value: sum(["clothes"]) },
    { label: "Utensils", value: sum(["utensils"]) },
    { label: "Fans", value: sum(["fans"]) },
  ];

  return (
    <div className="hf-stack">
      <DataBlock testId="inventory-kpis">
        <div className="hf-kpis hf-kpis-5">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="hf-kpi">
              <span>{kpi.label}</span>
              <strong>{formatCount(kpi.value)}</strong>
            </article>
          ))}
        </div>
      </DataBlock>

      <DataBlock
        testId="inventory-table"
        title="Depot stock"
        action={<Toggle label="Inventory depot" value={selection.depot} onChange={setDepot} />}
      >
        <div className="hf-table-wrap">
          <table className="hf-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Reserved</th>
                <th>Status</th>
              </tr>
            </thead>
            {GROUPS.map((group) => (
              <tbody key={group.id}>
                <tr className="hf-group">
                  <th colSpan={4} scope="colgroup">
                    {group.label}
                  </th>
                </tr>
                {stocksForDepot
                  .filter((item) => group.categories.includes(item.category))
                  .map((item) => {
                    const status = stockStatus(item.quantity, item.lowAt);
                    const demand = neededTownships(item.id);
                    return (
                      <tr key={item.id} data-item={item.id}>
                        <td>
                          {item.name}
                          {status !== "good" && demand.length > 0 && (
                            <button
                              type="button"
                              className="hf-link"
                              onClick={() => openAllocationForItem(item.id)}
                            >
                              Needed by {demand.length} {demand.length === 1 ? "township" : "townships"}
                            </button>
                          )}
                        </td>
                        <td>{formatCount(item.quantity)}</td>
                        <td>{formatCount(item.reserved)}</td>
                        <td>
                          <StatusPill status={status} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
      </DataBlock>
    </div>
  );
}
