/**
 * Camera View Web Component
 * Usage: <camera-view src="/streams/cam1/cam1.m3u8" name="Front Door"></camera-view>
 */
class CameraView extends HTMLElement {
    static get observedAttributes() {
        return ['src', 'name'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.hls = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 3000;
    }

    connectedCallback() {
        this.render();
        this.initPlayer();
    }

    disconnectedCallback() {
        this.destroyPlayer();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'src') {
                this.destroyPlayer();
                this.initPlayer();
            } else if (name === 'name') {
                this.updateLabel();
            }
        }
    }

    get src() {
        return this.getAttribute('src') || '';
    }

    get name() {
        return this.getAttribute('name') || 'Camera';
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    position: relative;
                    background: #1a1a1a;
                    border-radius: 8px;
                    overflow: hidden;
                    aspect-ratio: 16 / 9;
                }

                .container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }

                video {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    background: #000;
                }

                .label {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 8px 12px;
                    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                }

                .status {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #666;
                    transition: background 0.3s;
                }

                .status.live {
                    background: #22c55e;
                    box-shadow: 0 0 8px #22c55e;
                }

                .status.error {
                    background: #ef4444;
                }

                .status.loading {
                    background: #f59e0b;
                    animation: pulse 1s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.7);
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s;
                }

                .overlay.visible {
                    opacity: 1;
                    pointer-events: auto;
                }

                .overlay-icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                }

                .overlay-text {
                    font-size: 14px;
                    text-align: center;
                    max-width: 80%;
                }

                .controls {
                    position: absolute;
                    top: 8px;
                    left: 8px;
                    display: flex;
                    gap: 4px;
                    opacity: 0;
                    transition: opacity 0.3s;
                }

                .container:hover .controls {
                    opacity: 1;
                }

                .control-btn {
                    width: 32px;
                    height: 32px;
                    border: none;
                    border-radius: 4px;
                    background: rgba(0, 0, 0, 0.6);
                    color: #fff;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    transition: background 0.2s;
                }

                .control-btn:hover {
                    background: rgba(0, 0, 0, 0.8);
                }

                :host(:fullscreen) {
                    border-radius: 0;
                }

                :host(:fullscreen) video {
                    object-fit: contain;
                }
            </style>

            <div class="container">
                <video playsinline muted></video>
                <div class="status loading"></div>
                <div class="label">${this.escapeHtml(this.name)}</div>
                <div class="controls">
                    <button class="control-btn fullscreen-btn" title="Fullscreen">⛶</button>
                    <button class="control-btn refresh-btn" title="Refresh">↻</button>
                </div>
                <div class="overlay">
                    <div class="overlay-icon"></div>
                    <div class="overlay-text"></div>
                </div>
            </div>
        `;

        this.video = this.shadowRoot.querySelector('video');
        this.status = this.shadowRoot.querySelector('.status');
        this.overlay = this.shadowRoot.querySelector('.overlay');
        this.overlayIcon = this.shadowRoot.querySelector('.overlay-icon');
        this.overlayText = this.shadowRoot.querySelector('.overlay-text');

        // Bind event handlers
        this.shadowRoot.querySelector('.fullscreen-btn').addEventListener('click', () => this.toggleFullscreen());
        this.shadowRoot.querySelector('.refresh-btn').addEventListener('click', () => this.refresh());
        this.video.addEventListener('click', () => this.toggleFullscreen());
    }

    updateLabel() {
        const label = this.shadowRoot.querySelector('.label');
        if (label) {
            label.textContent = this.name;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initPlayer() {
        if (!this.src) {
            this.showError('No stream source');
            return;
        }

        this.showLoading();

        if (Hls.isSupported()) {
            this.initHls();
        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.initNativeHls();
        } else {
            this.showError('HLS not supported');
        }
    }

    initHls() {
        this.hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,        // Disable low latency to reduce CPU
            backBufferLength: 10,         // Reduce back buffer
            maxBufferLength: 6,           // Only buffer ~1 segment ahead
            maxMaxBufferLength: 12,       // Cap max buffer
            liveSyncDurationCount: 2,     // Stay closer to live edge
            liveMaxLatencyDurationCount: 4,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 2,
            levelLoadingTimeOut: 10000,
            levelLoadingMaxRetry: 2,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 2,
        });

        this.hls.loadSource(this.src);
        this.hls.attachMedia(this.video);

        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            this.video.play().catch(() => {});
            this.showLive();
        });

        this.hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        this.handleNetworkError();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        this.hls.recoverMediaError();
                        break;
                    default:
                        this.handleFatalError();
                        break;
                }
            }
        });
    }

    initNativeHls() {
        this.video.src = this.src;

        this.video.addEventListener('loadedmetadata', () => {
            this.video.play().catch(() => {});
            this.showLive();
        });

        this.video.addEventListener('error', () => {
            this.handleNetworkError();
        });
    }

    handleNetworkError() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            this.showError(`Reconnecting... (${this.retryCount}/${this.maxRetries})`);

            setTimeout(() => {
                if (this.hls) {
                    this.hls.startLoad();
                } else {
                    this.video.load();
                }
            }, this.retryDelay);
        } else {
            this.showError('Stream unavailable');
        }
    }

    handleFatalError() {
        this.destroyPlayer();
        this.showError('Stream error');

        setTimeout(() => {
            this.retryCount = 0;
            this.initPlayer();
        }, this.retryDelay * 2);
    }

    destroyPlayer() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        if (this.video) {
            this.video.src = '';
        }
    }

    showLoading() {
        this.status.className = 'status loading';
        this.overlay.classList.add('visible');
        this.overlayIcon.textContent = '⏳';
        this.overlayText.textContent = 'Connecting...';
    }

    showLive() {
        this.retryCount = 0;
        this.status.className = 'status live';
        this.overlay.classList.remove('visible');
    }

    showError(message) {
        this.status.className = 'status error';
        this.overlay.classList.add('visible');
        this.overlayIcon.textContent = '⚠';
        this.overlayText.textContent = message;
    }

    toggleFullscreen() {
        if (document.fullscreenElement === this) {
            document.exitFullscreen();
        } else {
            this.requestFullscreen();
        }
    }

    refresh() {
        this.retryCount = 0;
        this.destroyPlayer();
        this.initPlayer();
    }
}

customElements.define('camera-view', CameraView);
