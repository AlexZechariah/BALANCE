# syntax=docker/dockerfile:1.7

FROM cgr.dev/chainguard/wolfi-base@sha256:441d6709305552a3411e585ad98aacb9dadda00c80f3267483c38ac6f86f49d4

WORKDIR /worker

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

RUN apk add --no-cache \
    python-3.13=3.13.13-r5 \
    py3.13-pip=26.1.2-r0 \
    libglvnd=1.7.0-r9 \
    libgomp=16.1.0-r2 \
    tesseract=5.5.2-r8 \
    tesseract-eng=5.5.2-r8 \
  && addgroup -S balance \
  && adduser -S -G balance -h /home/balance balance \
  && install -d -o balance -g balance /data/balance-storage /home/balance/.paddleocr /tmp/balance-worker

COPY services/worker/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip python3.13 -m pip install -r requirements.txt \
  && python3.13 -m pip uninstall -y wheel

COPY --chown=balance:balance services/worker/app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python3.13", "-c", "import sys, urllib.request; response = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5); sys.exit(0 if 200 <= response.status < 400 else 1)"]

USER balance

CMD ["python3.13", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
