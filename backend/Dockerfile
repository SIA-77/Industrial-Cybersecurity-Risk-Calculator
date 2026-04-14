FROM python:3.10-slim

# ---- proxy for build ----
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}

WORKDIR /app

# ---- system deps ----
RUN apt-get update \
 && apt-get install -y --no-install-recommends graphviz fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# ---- python deps ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- app ----
COPY . .

CMD ["uvicorn", "api_main:app", "--host", "0.0.0.0", "--port", "8000"]
