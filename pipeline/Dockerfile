FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app/pipeline
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project
COPY src ./src
RUN uv sync --no-dev
ENV PATH="/app/pipeline/.venv/bin:$PATH" PYTHONUNBUFFERED=1
CMD ["python", "-m", "pipeline.cli", "--help"]
