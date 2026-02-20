(function() {
    'use strict';

    const grid = document.getElementById('camera-grid');
    const playAllBtn = document.getElementById('play-all');
    const stopAllBtn = document.getElementById('stop-all');
    const refreshAllBtn = document.getElementById('refresh-all');

    async function loadStreams() {
        try {
            const response = await fetch('/api/streams.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const streams = await response.json();

            if (!Array.isArray(streams) || streams.length === 0) {
                showMessage('No cameras configured');
                return;
            }

            renderCameras(streams);
        } catch (error) {
            console.error('Failed to load streams:', error);
            showMessage('Failed to load cameras', true);
        }
    }

    function renderCameras(streams) {
        grid.innerHTML = '';

        streams.forEach(stream => {
            const camera = document.createElement('camera-view');
            camera.setAttribute('src', stream.src);
            camera.setAttribute('name', stream.name);
            camera.id = stream.id;
            grid.appendChild(camera);
        });
    }

    function showMessage(text, isError = false) {
        grid.innerHTML = `<div class="${isError ? 'error-message' : 'loading-message'}">${text}</div>`;
    }

    function playAll() {
        const cameras = grid.querySelectorAll('camera-view');
        cameras.forEach(camera => {
            if (typeof camera.play === 'function') {
                camera.play();
            }
        });
    }

    function stopAll() {
        const cameras = grid.querySelectorAll('camera-view');
        cameras.forEach(camera => {
            if (typeof camera.stop === 'function') {
                camera.stop();
            }
        });
    }

    function refreshAll() {
        const cameras = grid.querySelectorAll('camera-view');
        cameras.forEach(camera => {
            if (typeof camera.refresh === 'function') {
                camera.refresh();
            }
        });
    }

    playAllBtn.addEventListener('click', playAll);
    stopAllBtn.addEventListener('click', stopAll);
    refreshAllBtn.addEventListener('click', refreshAll);

    document.addEventListener('DOMContentLoaded', loadStreams);
})();
