FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY data/external/bago_census_2024.json ./data/bago_census_2024.json
COPY artifacts ./artifacts
ENV CENSUS_PATH=/app/data/bago_census_2024.json
ENV MODEL_PATH=/app/artifacts/flood_logistic_pipeline.joblib
ENV MODEL_METADATA_PATH=/app/artifacts/model_metadata.json
ENV HELP_MODEL_PATH=/app/artifacts/flood_help_pipeline.joblib
ENV HELP_MODEL_METADATA_PATH=/app/artifacts/help_model_metadata.json

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
