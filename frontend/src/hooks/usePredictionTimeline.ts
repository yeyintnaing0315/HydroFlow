import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { addDays, filterDaysByMode, localToday, type TimeMode } from "../lib/dates";
import type {
  BagoAreasResponse,
  LoadState,
  PredictionMapScoresResponse,
  PredictionTimelineDay,
  PredictionTimelineResponse,
  TownshipMapScore,
} from "../types";

interface Resource<T> {
  state: LoadState;
  data?: T;
  error?: string;
}

const loading = <T,>(): Resource<T> => ({ state: "loading" });

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : "Unexpected request failure";
}

export function usePredictionTimeline(
  areas: BagoAreasResponse | undefined,
  selectedTownship: string,
  districtFilter: string,
) {
  const asOf = localToday();
  const [timeMode, setTimeMode] = useState<TimeMode>("today");
  const [selectedDate, setSelectedDate] = useState(asOf);
  const dateTouched = useRef(false);
  const [timeline, setTimeline] = useState<Resource<PredictionTimelineResponse>>(loading);
  const [mapScores, setMapScores] = useState<Resource<PredictionMapScoresResponse>>(loading);

  const selectedPlace = useMemo(() => {
    for (const district of areas?.districts ?? []) {
      const township = district.townships.find((item) => item.id === selectedTownship);
      if (township) return { district, township };
    }
    return undefined;
  }, [areas, selectedTownship]);

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    const { township } = selectedPlace;
    setTimeline(loading);
    api
      .predictionTimeline({
        date: asOf,
        as_of: asOf,
        township_id: township.id,
        latitude: township.latitude,
        longitude: township.longitude,
      })
      .then((data) => {
        if (active) setTimeline({ state: "ready", data });
      })
      .catch((reason) => {
        if (active) setTimeline({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [selectedPlace, asOf]);

  useEffect(() => {
    if (!dateTouched.current) setSelectedDate(asOf);
  }, [asOf]);

  useEffect(() => {
    const current = timeline.data?.days.find((day) => day.period_type === "current")?.date ?? timeline.data?.as_of;
    if (current && current === asOf && !dateTouched.current) setSelectedDate(current);
  }, [timeline.data, asOf]);

  useEffect(() => {
    let active = true;
    setMapScores(loading);
    const districtId = districtFilter === "all" ? undefined : districtFilter;
    api
      .predictionMapScores(selectedDate, districtId)
      .then((data) => {
        if (active) {
          setMapScores({
            state: data.scores.length ? "ready" : "empty",
            data,
          });
        }
      })
      .catch((reason) => {
        if (active) setMapScores({ state: "error", error: errorText(reason) });
      });
    return () => {
      active = false;
    };
  }, [selectedDate, districtFilter]);

  const modeRange = useMemo(() => filterDaysByMode(asOf, timeMode), [asOf, timeMode]);

  const modeDays = useMemo(() => {
    const days = timeline.data?.days ?? [];
    return days.filter((day) => day.date >= modeRange.start && day.date <= modeRange.end);
  }, [timeline.data, modeRange]);

  const chartDays = useMemo(() => timeline.data?.days ?? [], [timeline.data]);

  const selectedDay = useMemo(
    () => timeline.data?.days.find((day) => day.date === selectedDate),
    [timeline.data, selectedDate],
  );

  const scoresByTownship = useMemo(() => {
    const map = new Map<string, TownshipMapScore>();
    for (const score of mapScores.data?.scores ?? []) {
      map.set(score.township_id, score);
    }
    return map;
  }, [mapScores.data]);

  const chooseDate = useCallback((date: string) => {
    dateTouched.current = true;
    setSelectedDate(date);
  }, []);

  const setTimeModeAndDate = useCallback(
    (mode: TimeMode) => {
      setTimeMode(mode);
      const range = filterDaysByMode(asOf, mode);
      if (mode === "today") {
        setSelectedDate(asOf);
      } else if (mode === "past") {
        setSelectedDate(range.end);
      } else {
        setSelectedDate(range.start);
      }
    },
    [asOf],
  );

  const stepSelectedDate = useCallback(
    (direction: -1 | 1) => {
      const ordered = modeDays.map((day) => day.date);
      if (ordered.length === 0) return;
      const index = ordered.indexOf(selectedDate);
      const nextIndex = index === -1 ? 0 : Math.min(Math.max(index + direction, 0), ordered.length - 1);
      setSelectedDate(ordered[nextIndex]);
    },
    [modeDays, selectedDate],
  );

  return {
    asOf,
    timeMode,
    setTimeMode: setTimeModeAndDate,
    selectedDate,
    setSelectedDate: chooseDate,
    timeline,
    mapScores,
    modeDays,
    chartDays,
    selectedDay,
    scoresByTownship,
    stepSelectedDate,
    selectedPlace,
    modeRange,
  };
}

export type { PredictionTimelineDay, TimeMode };
