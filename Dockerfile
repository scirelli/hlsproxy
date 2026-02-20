# MediaMTX-based WebRTC streaming for security cameras
FROM bluenviron/mediamtx:latest AS mediamtx

# Runtime container with nginx for custom UI
FROM debian:bookworm-slim

LABEL org.opencontainers.image.name="org.cirelli.webrtc.cameras"

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/www/html/api \
    && mkdir -p /config \
    && mkdir -p /usr/local/share/mediamtx \
    && chown -R www-data:www-data /var/www/html

# Copy MediaMTX binary from official image
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

# Copy MediaMTX configuration template
COPY mediamtx.yml /usr/local/share/mediamtx/mediamtx.yml

# Copy nginx configuration
COPY nginx/default.conf /etc/nginx/sites-available/default

# Copy web files
COPY web/ /var/www/html/

# Copy entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Ports:
# 80 - nginx (web UI)
# 8889 - MediaMTX WebRTC (HTTP/WHEP)
# 8890 - MediaMTX WebRTC (UDP media)
# 8554 - RTSP (internal only, not exposed)
EXPOSE 80 8889 8890/udp

ENTRYPOINT ["/entrypoint.sh"]
