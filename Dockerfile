# Stage 1: Build LIVE555 from source
FROM debian:bookworm-slim AS builder

LABEL org.opencontainers.image.name="org.cirelli.hlsproxy.cameras"

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Download and extract LIVE555
RUN wget -q https://download.live555.com/live555-latest.tar.gz \
    && tar xzf live555-latest.tar.gz \
    && rm live555-latest.tar.gz

# Build LIVE555 with static linking
WORKDIR /build/live
RUN sed -i 's/CPLUSPLUS_FLAGS =/CPLUSPLUS_FLAGS = -std=c++20/' config.linux \
    && ./genMakefiles linux \
    && make -j$(nproc)

# Stage 2: Runtime container
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/www/html/streams \
    && mkdir -p /var/www/html/api \
    && mkdir -p /config \
    && mkdir -p /var/log/supervisor \
    && chown -R www-data:www-data /var/www/html

# Copy LIVE555 HLS Proxy binary
COPY --from=builder /build/live/hlsProxy/live555HLSProxy /usr/local/bin/

# Copy nginx configuration
COPY nginx/default.conf /etc/nginx/sites-available/default

# Copy supervisor configuration
COPY scripts/supervisor.conf /etc/supervisor/conf.d/supervisord.conf

# Copy web files
COPY web/ /var/www/html/

# Copy entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
