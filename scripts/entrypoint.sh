#!/bin/bash
set -e

STREAMS_FILE="/config/streams.txt"
API_DIR="/var/www/html/api"
MEDIAMTX_CONFIG="/mediamtx.yml"
MEDIAMTX_TEMPLATE="/usr/local/share/mediamtx/mediamtx.yml"

# Copy template config if it exists, otherwise use bundled config
if [ -f "$MEDIAMTX_TEMPLATE" ]; then
    cp "$MEDIAMTX_TEMPLATE" "$MEDIAMTX_CONFIG"
else
    # Use config from build context (copied to root)
    cp /var/www/html/../mediamtx.yml "$MEDIAMTX_CONFIG" 2>/dev/null || true
fi

# If WEBRTC_HOST is set, configure MediaMTX to advertise it for WebRTC ICE
# Can be a domain name (e.g., cameras.example.com) or IP address
if [ -n "$WEBRTC_HOST" ]; then
    echo "Configuring WebRTC host: $WEBRTC_HOST"
    # Insert webrtcAdditionalHosts after webrtcLocalUDPAddress line
    sed -i "/webrtcLocalUDPAddress:/a webrtcAdditionalHosts: [$WEBRTC_HOST]" "$MEDIAMTX_CONFIG"
fi

# URL encode a string (for special characters in passwords)
urlencode() {
    local string="$1"
    local strlen=${#string}
    local encoded=""
    local pos c o

    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="$c" ;;
            * ) printf -v o '%%%02X' "'$c" ;;
        esac
        encoded+="$o"
    done
    echo "$encoded"
}

# Parse RTSP URL and extract components
parse_rtsp_url() {
    local url="$1"
    local regex='^rtsp://([^:]+):([^@]+)@(.+)$'

    if [[ $url =~ $regex ]]; then
        RTSP_USER="${BASH_REMATCH[1]}"
        RTSP_PASS="${BASH_REMATCH[2]}"
        RTSP_REST="${BASH_REMATCH[3]}"
        RTSP_HAS_CREDS=1
    else
        RTSP_USER=""
        RTSP_PASS=""
        RTSP_REST=""
        RTSP_HAS_CREDS=0
    fi
}

# Wait for streams file
if [ ! -f "$STREAMS_FILE" ]; then
    echo "Error: streams.txt not found at $STREAMS_FILE"
    echo "Mount your streams file to /config/streams.txt"
    exit 1
fi

echo "Parsing streams configuration..."

# Initialize streams JSON array and MediaMTX paths
streams_json="["
mediamtx_paths=""
first_stream=true
stream_count=0

# Read streams file and generate configuration
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    stream_count=$((stream_count + 1))
    cam_id="cam${stream_count}"

    # Parse line: check for extended format with -u prefix
    if [[ "$line" =~ ^[[:space:]]*-u[[:space:]] ]]; then
        # Extended format: -u username password rtsp://... | Name
        if [[ "$line" =~ ^[[:space:]]*-u[[:space:]]+([^[:space:]]+)[[:space:]]+([^[:space:]]+)[[:space:]]+(rtsp://[^|]+)\|?[[:space:]]*(.*)?$ ]]; then
            ext_user="${BASH_REMATCH[1]}"
            ext_pass="${BASH_REMATCH[2]}"
            rtsp_url="${BASH_REMATCH[3]}"
            display_name="${BASH_REMATCH[4]}"
            rtsp_url=$(echo "$rtsp_url" | xargs)  # trim whitespace

            # Build URL with credentials
            encoded_user=$(urlencode "$ext_user")
            encoded_pass=$(urlencode "$ext_pass")
            # Extract host/path from rtsp://host/path
            rtsp_host_path="${rtsp_url#rtsp://}"
            final_rtsp_url="rtsp://${encoded_user}:${encoded_pass}@${rtsp_host_path}"
        else
            echo "Warning: Could not parse extended format line: $line"
            continue
        fi
    else
        # Standard format: rtsp://[user:pass@]host/path | Name
        if [[ "$line" =~ ^([^|]+)\|?[[:space:]]*(.*)?$ ]]; then
            rtsp_url="${BASH_REMATCH[1]}"
            display_name="${BASH_REMATCH[2]}"
            rtsp_url=$(echo "$rtsp_url" | xargs)  # trim whitespace

            # Check if URL has embedded credentials
            parse_rtsp_url "$rtsp_url"

            if [ "$RTSP_HAS_CREDS" -eq 1 ]; then
                # Extract and URL-encode credentials, rebuild URL
                encoded_user=$(urlencode "$RTSP_USER")
                encoded_pass=$(urlencode "$RTSP_PASS")
                final_rtsp_url="rtsp://${encoded_user}:${encoded_pass}@${RTSP_REST}"
            else
                # No credentials in URL
                final_rtsp_url="$rtsp_url"
            fi
        else
            echo "Warning: Could not parse line: $line"
            continue
        fi
    fi

    # Default display name if not provided
    [[ -z "$display_name" ]] && display_name="Camera ${stream_count}"
    display_name=$(echo "$display_name" | xargs)  # trim whitespace

    echo "Configuring stream ${stream_count}: ${display_name}"

    # Add MediaMTX path configuration
    mediamtx_paths+="
  ${cam_id}:
    source: ${final_rtsp_url}"

    # Add to streams JSON
    if [ "$first_stream" = true ]; then
        first_stream=false
    else
        streams_json+=","
    fi

    # Escape display name for JSON
    escaped_name=$(echo "$display_name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    streams_json+="{\"id\":\"${cam_id}\",\"name\":\"${escaped_name}\",\"src\":\"/${cam_id}/whep\"}"

done < "$STREAMS_FILE"

# Close JSON array
streams_json+="]"

# Write streams.json for frontend
echo "$streams_json" > "${API_DIR}/streams.json"
chown www-data:www-data "${API_DIR}/streams.json"

# Append paths to MediaMTX config
echo "$mediamtx_paths" >> "$MEDIAMTX_CONFIG"

echo "Configured ${stream_count} stream(s)"
echo "Starting services..."

# Start nginx in background
nginx &

# Start MediaMTX (foreground)
exec /usr/local/bin/mediamtx "$MEDIAMTX_CONFIG"
