# WebRTC Proxy for Security Cameras

A containerized solution to convert RTSP security camera streams to WebRTC for low-latency browser viewing using MediaMTX.

## Features

- **RTSP to WebRTC conversion** using MediaMTX
- **Low latency streaming** - sub-second delay vs 10-30 seconds with HLS
- **Efficient bandwidth** - single WebRTC connection vs constant HLS segment downloads
- **On-demand streaming** - cameras only connect when someone is viewing
- **Multi-camera support** with automatic stream discovery
- **Responsive web UI** with dark theme for security monitoring
- **Web Components** for modular, encapsulated camera views
- **Auto-reconnect** on stream errors
- **Fullscreen mode** per camera
- **Docker-based** for easy deployment

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Container                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   MediaMTX                       │   │
│  │  - Reads RTSP from cameras                      │   │
│  │  - Serves WebRTC via WHEP protocol              │   │
│  │  - On-demand connection (sourceOnDemand)        │   │
│  └─────────────────────────────────────────────────┘   │
│         │                                              │
│         │ WebRTC (WHEP)                               │
│         ▼                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   nginx                          │   │
│  │   - Serves static HTML/CSS/JS (port 80)         │   │
│  │   - Proxies /camN/whep to MediaMTX              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

Exposed Ports:
  - 80:   Web UI (mapped to 8080 in docker-compose)
  - 8889: WebRTC HTTP (WHEP signaling)
  - 8890: WebRTC UDP (ICE mux)
```

## Quick Start

1. **Create your streams configuration:**

   ```bash
   cp streams.txt.example streams.txt
   ```

2. **Edit `streams.txt`** with your camera RTSP URLs:

   ```
   rtsp://192.168.1.100:554/cam/realmonitor?channel=1&subtype=0 | Front Door
   rtsp://192.168.1.101:554/cam/realmonitor?channel=1&subtype=0 | Back Yard
   ```

3. **Build the image:**

   ```bash
   docker build -t org.cirelli.webrtc.cameras .
   ```

4. **Run:**

   ```bash
   docker compose up -d
   ```

5. **Open your browser:**

   Navigate to `http://localhost:8080`

## Streams Configuration

The `streams.txt` file defines your camera streams. One stream per line.

### Format

```
<rtsp-url> | <display-name>
```

### Examples

**Basic stream (no authentication):**
```
rtsp://192.168.1.100:554/cam/realmonitor?channel=1&subtype=0 | Front Door
```

**Stream with credentials:**
```
rtsp://admin:password@192.168.1.101:554/stream1 | Backyard
```

**Stream with URL-encoded special characters:**
```
rtsp://admin:p%40ssw%21rd@192.168.1.102:554/stream1 | Garage
```

Common URL encodings:
- `@` = `%40`
- `!` = `%21`
- `#` = `%23`
- `:` = `%3A`
- `/` = `%2F`

**Extended format for complex passwords:**
```
-u admin p@ssw!rd rtsp://192.168.1.103:554/stream1 | Driveway
```

### Lorex Camera URLs

Lorex cameras typically use these URL formats:

```
# Main stream (higher quality)
rtsp://<ip>:554/cam/realmonitor?channel=1&subtype=0

# Sub stream (lower quality, less bandwidth)
rtsp://<ip>:554/cam/realmonitor?channel=1&subtype=1
```

## Configuration Options

### Docker Compose

```yaml
services:
  webrtc-cameras:
    image: org.cirelli.webrtc.cameras
    ports:
      - "8080:80"         # Web UI
      - "8889:8889"       # WebRTC HTTP (WHEP signaling)
      - "8890:8890/udp"   # WebRTC UDP (ICE mux)
    volumes:
      - ./streams.txt:/config/streams.txt:ro
    restart: unless-stopped
```

### Environment Variables

Currently, all configuration is done through the `streams.txt` file.

## Web Interface

The web interface provides:

- **Responsive grid layout** - Automatically adjusts columns based on screen size
- **Live status indicator** - Green dot when streaming, yellow when loading, red on error
- **Fullscreen mode** - Click a camera or use the fullscreen button
- **Refresh controls** - Refresh individual cameras or all at once
- **Auto-reconnect** - Automatically attempts to reconnect on stream errors

## Development

### Building the Image

```bash
docker build -t org.cirelli.webrtc.cameras .
```

### Running Without Docker Compose

```bash
docker run -d \
  -p 8080:80 \
  -p 8889:8889 \
  -p 8890:8890/udp \
  -v $(pwd)/streams.txt:/config/streams.txt:ro \
  --name webrtc-cameras \
  org.cirelli.webrtc.cameras
```

### Viewing Logs

```bash
# All logs
docker compose logs -f

# MediaMTX logs (stream connections, errors)
docker compose logs -f | grep -E "(mediamtx|rtsp|webrtc)"
```

## Troubleshooting

### Camera not connecting

1. Verify the RTSP URL works with VLC or ffplay:
   ```bash
   ffplay rtsp://192.168.1.100:554/cam/realmonitor?channel=1&subtype=0
   ```

2. Check the container logs:
   ```bash
   docker compose logs -f
   ```

3. Ensure your camera is accessible from the Docker container (check firewall rules)

### WebRTC connection failing

1. Ensure ports 8889 (TCP) and 8890 (UDP) are accessible
2. WebRTC requires UDP for media transport - ensure firewall allows UDP traffic
3. Check browser console for WebRTC errors

### Stream buffering or lagging

- Use the sub-stream (`subtype=1`) instead of main stream for lower bandwidth
- Ensure adequate network bandwidth between camera and server
- Check container resource usage with `docker stats`

### Special characters in password

Use the extended format with `-u` prefix:
```
-u admin my@complex!pass rtsp://192.168.1.100:554/stream1 | Camera Name
```

## Technical Details

### Components

- **MediaMTX** - Media server that converts RTSP to WebRTC
- **nginx** - Serves web files and proxies WHEP requests
- **WebRTC (WHEP)** - Low-latency streaming protocol

### Stream URLs

| Path | Description |
|------|-------------|
| `/cam1/whep` | WebRTC WHEP endpoint for camera 1 |
| `/cam2/whep` | WebRTC WHEP endpoint for camera 2 |
| `/api/streams.json` | JSON list of configured cameras |

### Browser Support

WebRTC is supported in all modern browsers:
- Chrome 23+
- Firefox 22+
- Safari 11+
- Edge 12+

### Comparison with HLS

| Feature | WebRTC | HLS |
|---------|--------|-----|
| Latency | <1 second | 10-30 seconds |
| Bandwidth | Single connection | Constant segment downloads |
| CPU Usage | Lower | Higher (segment processing) |
| Browser Support | All modern | All (with HLS.js) |

## License

MIT
