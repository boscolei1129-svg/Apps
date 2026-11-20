export const isRelayToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

// Decode camera frames locally without storing them or sending them over the network.
export function scanReadToken(video, onToken, onStatus) {
  let stream, frame, timer;
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', stopWhenHidden);
    window.removeEventListener('pagehide', pause);
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.hidden = true;
  }

  function finish(message) {
    stop();
    onStatus(message, false);
  }

  function pause() {
    finish('Camera paused. Tap Scan read token QR to try again.');
  }

  function stopWhenHidden() {
    if (document.hidden) pause();
  }

  window.addEventListener('pagehide', pause);
  document.addEventListener('visibilitychange', stopWhenHidden);
  onStatus('Opening the camera…', true);
  timer = setTimeout(() => finish('No QR read yet. Tap Scan read token QR to try again.'), 60000);

  async function open() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        finish('Camera is unavailable here. Try opening Lull directly in Safari, or paste the read token.');
        return;
      }
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      if (stopped) {
        camera.getTracks().forEach(track => track.stop());
        return;
      }
      stream = camera;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (stopped) return;

      const { default: decode } = await import('./vendor/jsQR.js');
      if (stopped) return;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || typeof decode !== 'function') throw new Error('QR decoder unavailable');

      let lastFrame = -Infinity;
      onStatus('Point your camera at the read token QR on your PC.', true);
      frame = requestAnimationFrame(check);

      function check(now) {
        if (stopped) return;
        try {
          if (now - lastFrame >= 160 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            lastFrame = now;
            const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
            const width = Math.max(1, Math.round(video.videoWidth * scale));
            const height = Math.max(1, Math.round(video.videoHeight * scale));
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height);
            const result = decode(pixels.data, width, height, { inversionAttempts: 'dontInvert' });
            if (result && isRelayToken(result.data)) {
              onToken(result.data);
              finish('Read token filled in. Tap Connect & sync.');
              return;
            }
            if (result) onStatus('That QR is not a read token. Scan the Lull read token QR on your PC.', true);
          }
          frame = requestAnimationFrame(check);
        } catch {
          finish('Could not read the camera. Try scanning again or paste the read token.');
        }
      }
    } catch (error) {
      if (stopped) return;
      finish(error.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow camera access for Lull, then try again.'
        : 'Could not start scanning. Try opening Lull directly in Safari, or paste the read token.');
    }
  }

  void open();
  return stop;
}
