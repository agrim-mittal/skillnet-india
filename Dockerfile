FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt
COPY . .
COPY --from=web /web/dist ./frontend/dist
# data/processed and frontend/public/data are produced by `python -m pipeline.run_all` (run it before building, or here):
# RUN python -m pipeline.run_all
EXPOSE 8000
# $PORT is set by hosts like Render/Railway/Fly; defaults to 8000 locally
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
