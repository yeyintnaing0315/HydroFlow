# Data directories

- `raw/` contains immutable, provenance-recorded input files.
- `processed/` contains reproducible generated outputs and is ignored by Git.
- `external/` holds independently sourced reference data.
  `external/bago_census_2024.json` is the 2024 census base for Bago Region:
  population by sex, urban and rural residence, age group, household size, and
  dwelling type. It is built from `2024_census_bago_report (update).xlsx`.

Flood-model inputs stay in `raw/` and `processed/`. The census file is a
planning reference, not a model feature.
