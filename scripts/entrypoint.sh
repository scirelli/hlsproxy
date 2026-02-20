#!/bin/bash
set -e

STREAMS_FILE="/config/streams.txt"
STREAMS_DIR="/var/www/html/streams"
API_DIR="/var/www/html/api"
SUPERVISOR_CONF="/etc/supervisor/conf.d/supervisord.conf"

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

# Initialize streams JSON array
streams_json="["
first_stream=true
stream_count=0

# Read streams file and generate configuration
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    stream_count=$((stream_count + 1))
    cam_id="cam${stream_count}"
    cam_dir="${STREAMS_DIR}/${cam_id}"

    # Parse line: check for extended format with -u prefix
    if [[ "$line" =~ ^[[:space:]]*-u[[:space:]] ]]; then
        # Extended format: -u username password rtsp://... | Name
        if [[ "$line" =~ ^[[:space:]]*-u[[:space:]]+([^[:space:]]+)[[:space:]]+([^[:space:]]+)[[:space:]]+(rtsp://[^|]+)\|?[[:space:]]*(.*)?$ ]]; then
            ext_user="${BASH_REMATCH[1]}"
            ext_pass="${BASH_REMATCH[2]}"
            rtsp_url="${BASH_REMATCH[3]}"
            display_name="${BASH_REMATCH[4]}"
            rtsp_url=$(echo "$rtsp_url" | xargs)  # trim whitespace
            use_separate_auth=1
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
            use_separate_auth=0
            ext_user=""
            ext_pass=""
        else
            echo "Warning: Could not parse line: $line"
            continue
        fi
    fi

    # Default display name if not provided
    [[ -z "$display_name" ]] && display_name="Camera ${stream_count}"
    display_name=$(echo "$display_name" | xargs)  # trim whitespace

    echo "Configuring stream ${stream_count}: ${display_name}"

    # Create camera directory
    mkdir -p "$cam_dir"
    chown www-data:www-data "$cam_dir"

    # Build HLS proxy command
    # Use relative path for output so m3u8 contains relative segment URLs
    hls_output="${cam_id}"

    if [ "$use_separate_auth" -eq 1 ]; then
        # Use -u flag for credentials
        hls_cmd="live555HLSProxy -u \"${ext_user}\" \"${ext_pass}\" -t \"${rtsp_url}\" \"${hls_output}\""
    else
        # Check if URL has embedded credentials
        parse_rtsp_url "$rtsp_url"

        if [ "$RTSP_HAS_CREDS" -eq 1 ]; then
            # Extract and URL-encode credentials, rebuild URL
            encoded_user=$(urlencode "$RTSP_USER")
            encoded_pass=$(urlencode "$RTSP_PASS")
            clean_url="rtsp://${encoded_user}:${encoded_pass}@${RTSP_REST}"
            hls_cmd="live555HLSProxy -t \"${clean_url}\" \"${hls_output}\""
        else
            # No credentials in URL
            hls_cmd="live555HLSProxy -t \"${rtsp_url}\" \"${hls_output}\""
        fi
    fi

    # Add to supervisor config
    cat >> "$SUPERVISOR_CONF" << EOF

[program:hlsproxy-${cam_id}]
command=/bin/bash -c '${hls_cmd}'
directory=${cam_dir}
autostart=true
autorestart=true
startsecs=5
startretries=3
stderr_logfile=/var/log/supervisor/hlsproxy-${cam_id}-error.log
stdout_logfile=/var/log/supervisor/hlsproxy-${cam_id}.log
EOF

    # Add to streams JSON
    if [ "$first_stream" = true ]; then
        first_stream=false
    else
        streams_json+=","
    fi

    # Escape display name for JSON
    escaped_name=$(echo "$display_name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    streams_json+="{\"id\":\"${cam_id}\",\"name\":\"${escaped_name}\",\"src\":\"/streams/${cam_id}/${cam_id}.m3u8\"}"

done < "$STREAMS_FILE"

# Close JSON array
streams_json+="]"

# Write streams.json for frontend
echo "$streams_json" > "${API_DIR}/streams.json"
chown www-data:www-data "${API_DIR}/streams.json"

echo "Configured ${stream_count} stream(s)"
echo "Starting supervisor..."

# Start supervisor
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
