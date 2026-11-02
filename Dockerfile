FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# "." makes the built app call the API on its own origin (./api/...), so no URL is hard-coded.
ARG VITE_API_URL=.
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt
COPY backend ./backend
COPY pipeline ./pipeline
COPY data/processed ./data/processed
COPY frontend/public/data ./frontend/public/data
COPY --from=web /web/dist ./frontend/dist
ENV PORT=8000
EXPOSE 8000
# --proxy-headers so rate limiting sees the real client IP behind the host's load balancer
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
