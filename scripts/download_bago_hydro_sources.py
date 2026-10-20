#!/usr/bin/env python3
"""Download Open-Meteo ERA5 archive, NASA POWER, and GloFAS discharge for Bago townships.

Writes under data/external/:
  open_meteo_archive_daily/{township_id}.csv
  glofas_discharge/{township_id}.csv
  nasa_power_hydro/{township_id}.csv
  hydro_merged/{township_id}.csv   (rain + discharge + met, use for prediction replay)

Example (all townships, 1984 through yesterday — may take hours):
  python scripts/download_bago_hydro_sources.py --start 1984-01-01

Single township smoke test:
  python scripts/download_bago_hydro_sources.py --township taungoo --start 2020-01-01 --end 2020-12-31
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.hydro_download import download_all_townships, download_township_series  # noqa: E402
from app.services.hydro_history import GLOFAS_DISCHARGE_START  # noqa: E402
from app.services.hydro_sources import all_download_locations, download_locations  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--start",
        type=date.fromisoformat,
        default=GLOFAS_DISCHARGE_START,
        help="First day (default 1984-01-01, GloFAS consolidated_v4)",
    )
    parser.add_argument(
        "--end",
        type=date.fromisoformat,
        default=date.today() - timedelta(days=1),
        help="Last day (default yesterday)",
    )
    parser.add_argument(
        "--township",
        action="append",
        dest="townships",
        metavar="ID",
        help="Township id slug (e.g. bago, taungoo). Repeat for multiple. Default: all.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip townships that already have hydro_merged/{id}.csv",
    )
    args = parser.parse_args()
    if args.end < args.start:
        raise SystemExit("--end must be on or after --start")

    township_ids = set(args.townships) if args.townships else None

    async def run() -> None:
        catalog = await all_download_locations()
        if township_ids:
            known = {loc.township_id for loc in catalog} | {loc.storage_id for loc in catalog}
            unknown = township_ids - known
            if unknown:
                raise SystemExit(f"Unknown township id(s): {', '.join(sorted(unknown))}")
        if township_ids and len(township_ids) == 1:
            only = next(
                loc
                for loc in catalog
                if loc.township_id in township_ids or loc.storage_id in township_ids
            )
            path = await download_township_series(
                only, args.start, args.end, skip_existing=args.skip_existing
            )
            print(f"Done: {path}")
            return
        paths = await download_all_townships(
            args.start,
            args.end,
            skip_existing=args.skip_existing,
            township_ids=township_ids,
        )
        print(f"Downloaded {len(paths)} township series into data/external/")

    asyncio.run(run())


if __name__ == "__main__":
    main()
