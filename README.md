# HLS Proxy for Lorex Security Cameras

A containerized solution to convert Lorex security camera RTSP streams to HLS (HTTP Live Streaming) for browser viewing.

## Features

- **RTSP to HLS conversion** using LIVE555 HLS Proxy
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
│  ┌─────────────────────────────────────────────────┐    │
│  │              Supervisor Process                  │    │
│  │  - Reads /config/streams.txt                    │    │
│  │  - Spawns one live555HLSProxy per stream        │    │
│  │  - Manages nginx for web serving                │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HLS Proxy 1  │  │ HLS Proxy 2  │  │ HLS Proxy N  │  │
│  │ (Camera 1)   │  │ (Camera 2)   │  │ (Camera N)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                │                 │           │
│         ▼                ▼                 ▼           │
│  ┌─────────────────────────────────────────────────┐   │
│  │           /var/www/html/streams/                │   │
│  │   cam1/*.ts, cam1/index.m3u8                   │   │
│  │   cam2/*.ts, cam2/index.m3u8                   │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   nginx                         │   │
│  │   - Serves static HTML/CSS/JS                  │   │
│  │   - Serves HLS segments                        │   │
│  │   - Port 8080                                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
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
   docker build -t org.cirelli.hlsproxy.cameras .
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
  hlsproxy:
    image: org.cirelli.hlsproxy.cameras
    ports:
      - "8080:8080"      # Web UI port
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
docker build -t org.cirelli.hlsproxy.cameras .
```

### Running Without Docker Compose

```bash
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/streams.txt:/config/streams.txt:ro \
  --name hlsproxy \
  org.cirelli.hlsproxy.cameras
```

### Viewing Logs

```bash
# All logs
docker compose logs -f

# Specific service logs
docker exec hlsproxy tail -f /var/log/supervisor/hlsproxy-cam1.log
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

- **LIVE555 HLS Proxy** - Converts RTSP to HLS segments
- **nginx** - Serves web files and HLS streams with proper CORS headers
- **Supervisor** - Process manager for nginx and HLS proxy instances
- **HLS.js** - JavaScript HLS player with Safari native fallback

### HLS Output

Each camera stream produces:
- `<cam_id>.m3u8` - HLS playlist file (updated continuously)
- `<cam_id>-*.ts` - HLS segment files (6-second chunks)

### Browser Support

- Chrome, Firefox, Edge - Uses HLS.js
- Safari - Uses native HLS support

## License

MIT
