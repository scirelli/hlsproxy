/**
 * Camera View Web Component - WebRTC Edition
 * Usage: <camera-view src="/cam1/whep" name="Front Door"></camera-view>
 *
 * Supports lazy loading - streams only start when clicked.
 * Add autoplay attribute to start immediately: <camera-view src="..." autoplay></camera-view>
 */
class CameraView extends HTMLElement {
    static get observedAttributes() {
        return ['src', 'name', 'autoplay'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.pc = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 3000;
        this.isPlaying = false;
    }

    connectedCallback() {
        this.render();
        if (this.hasAttribute('autoplay')) {
            this.initPlayer();
        } else {
            this.showPaused();
        }
    }

    disconnectedCallback() {
        this.destroyPlayer();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'src' && this.isPlaying) {
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
                    background: #000;
                    border-radius: 4px;
                    overflow: hidden;
                    height: 100%;
                    min-height: 150px;
                }

                .container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    cursor: pointer;
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
                    padding: 4px 8px;
                    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                }

                .status {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #666;
                    transition: background 0.3s;
                }

                .status.live {
                    background: #22c55e;
                    box-shadow: 0 0 6px #22c55e;
                }

                .status.error {
                    background: #ef4444;
                }

                .status.loading {
                    background: #f59e0b;
                    animation: pulse 1s infinite;
                }

                .status.paused {
                    background: #666;
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
                    font-size: 36px;
                    margin-bottom: 8px;
                }

                .overlay-text {
                    font-size: 12px;
                    text-align: center;
                    max-width: 80%;
                }

                .controls {
                    position: absolute;
                    top: 4px;
                    left: 4px;
                    display: flex;
                    gap: 2px;
                    opacity: 0;
                    transition: opacity 0.3s;
                }

                .container:hover .controls {
                    opacity: 1;
                }

                .control-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 3px;
                    background: rgba(0, 0, 0, 0.6);
                    color: #fff;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
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
                <video playsinline muted autoplay></video>
                <div class="status paused"></div>
                <div class="label">${this.escapeHtml(this.name)}</div>
                <div class="controls">
                    <button class="control-btn play-btn" title="Play/Stop">▶</button>
                    <button class="control-btn fullscreen-btn" title="Fullscreen">⛶</button>
                    <button class="control-btn refresh-btn" title="Refresh">↻</button>
                </div>
                <div class="overlay visible">
                    <div class="overlay-icon">▶</div>
                    <div class="overlay-text">Click to play</div>
                </div>
            </div>
        `;

        this.video = this.shadowRoot.querySelector('video');
        this.status = this.shadowRoot.querySelector('.status');
        this.overlay = this.shadowRoot.querySelector('.overlay');
        this.overlayIcon = this.shadowRoot.querySelector('.overlay-icon');
        this.overlayText = this.shadowRoot.querySelector('.overlay-text');
        this.playBtn = this.shadowRoot.querySelector('.play-btn');

        // Bind event handlers
        this.shadowRoot.querySelector('.fullscreen-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });
        this.shadowRoot.querySelector('.refresh-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.refresh();
        });
        this.playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlay();
        });
        this.shadowRoot.querySelector('.container').addEventListener('click', () => {
            if (!this.isPlaying) {
                this.play();
            }
        });
        this.video.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isPlaying) {
                this.toggleFullscreen();
            }
        });
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

    play() {
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.playBtn.textContent = '⏹';
            this.playBtn.title = 'Stop';
            this.initPlayer();
        }
    }

    stop() {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.playBtn.textContent = '▶';
            this.playBtn.title = 'Play';
            this.destroyPlayer();
            this.showPaused();
        }
    }

    togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    initPlayer() {
        if (!this.src) {
            this.showError('No stream source');
            return;
        }

        this.showLoading();
        this.initWebRTC();
    }

    async initWebRTC() {
        try {
            // Create peer connection
            this.pc = new RTCPeerConnection({
                iceServers: []  // No STUN/TURN needed for local network
            });

            // Handle incoming tracks
            this.pc.ontrack = (evt) => {
                this.video.srcObject = evt.streams[0];
                this.showLive();
            };

            // Handle connection state changes
            this.pc.onconnectionstatechange = () => {
                switch (this.pc.connectionState) {
                    case 'connected':
                        this.showLive();
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.handleConnectionError();
                        break;
                }
            };

            // Handle ICE connection state
            this.pc.oniceconnectionstatechange = () => {
                if (this.pc.iceConnectionState === 'failed') {
                    this.handleConnectionError();
                }
            };

            // Add transceivers for receiving video and audio
            this.pc.addTransceiver('video', { direction: 'recvonly' });
            this.pc.addTransceiver('audio', { direction: 'recvonly' });

            // Create offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            // Wait for ICE gathering to complete
            await this.waitForIceGathering();

            // Send offer to WHEP endpoint
            const response = await fetch(this.src, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp'
                },
                body: this.pc.localDescription.sdp
            });

            if (!response.ok) {
                throw new Error(`WHEP request failed: ${response.status}`);
            }

            // Set remote description from answer
            const answerSdp = await response.text();
            await this.pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });

        } catch (error) {
            console.error('WebRTC error:', error);
            this.handleConnectionError();
        }
    }

    waitForIceGathering() {
        return new Promise((resolve) => {
            if (this.pc.iceGatheringState === 'complete') {
                resolve();
                return;
            }

            const checkState = () => {
                if (this.pc.iceGatheringState === 'complete') {
                    this.pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };

            this.pc.addEventListener('icegatheringstatechange', checkState);

            // Timeout after 2 seconds
            setTimeout(() => {
                this.pc.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }, 2000);
        });
    }

    handleConnectionError() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            this.showError(`Reconnecting... (${this.retryCount}/${this.maxRetries})`);

            setTimeout(() => {
                if (this.isPlaying) {
                    this.destroyPlayer();
                    this.initPlayer();
                }
            }, this.retryDelay);
        } else {
            this.showError('Stream unavailable');
        }
    }

    destroyPlayer() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    showPaused() {
        this.status.className = 'status paused';
        this.overlay.classList.add('visible');
        this.overlayIcon.textContent = '▶';
        this.overlayText.textContent = 'Click to play';
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
        if (this.isPlaying) {
            this.initPlayer();
        }
    }
}

customElements.define('camera-view', CameraView);
