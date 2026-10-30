# Build from the repository root: docker build -f equanime-collector/Dockerfile .
# The digest is the multi-arch index, so the ARM server pulls arm64.
FROM python:3.12-slim@sha256:aa943ce411423c7582288f18707ff66eddcbaeb510502d747a72aeb34f30d159

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    EQUANIME_FIXTURES=/app/fixtures/curricula.json \
    EQUANIME_COLLECTOR_DB=/data/jobs.sqlite

WORKDIR /app
COPY equanime-collector/pyproject.toml equanime-collector/README.md ./
COPY equanime-collector/src ./src
COPY fixtures ./fixtures
RUN pip install --no-cache-dir . && useradd --uid 10001 --no-create-home collector && mkdir /data && chown collector /data

USER collector
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=3)"
CMD ["uvicorn", "equanime_collector.main:app", "--host", "0.0.0.0", "--port", "8090", "--proxy-headers"]
