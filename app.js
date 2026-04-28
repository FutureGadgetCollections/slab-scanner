// State
let frontImageData = null;
let backImageData = null;
let cvReady = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupDropZones();
    setupFileInputs();

    showStatus('Loading detection engine...', 'info');
    await waitForOpenCV();
    cvReady = true;
    showStatus('Detection engine ready', 'success');

    // Process any image already uploaded while waiting
    if (frontImageData && !frontImageData.boundingBox) processImage('front', frontImageData.image);
    if (backImageData && !backImageData.boundingBox) processImage('back', backImageData.image);
});

function waitForOpenCV() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.cv && typeof window.cv.Mat === 'function') return resolve();
            if (window.__cvReady && window.cv) {
                if (window.cv['onRuntimeInitialized']) {
                    const prev = window.cv['onRuntimeInitialized'];
                    window.cv['onRuntimeInitialized'] = () => { prev && prev(); resolve(); };
                    return;
                }
            }
            setTimeout(check, 100);
        };
        check();
    });
}

function setupDropZones() {
    ['front', 'back'].forEach(side => {
        const zone = document.getElementById(`${side}DropZone`);
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length) handleImageUpload(files[0], side);
        });
    });
}

function setupFileInputs() {
    document.getElementById('frontInput').addEventListener('change', (e) => {
        if (e.target.files.length) handleImageUpload(e.target.files[0], 'front');
    });
    document.getElementById('backInput').addEventListener('change', (e) => {
        if (e.target.files.length) handleImageUpload(e.target.files[0], 'back');
    });
}

function handleImageUpload(file, side) {
    if (!file.type.startsWith('image/')) {
        showStatus('Please upload an image file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            if (side === 'front') frontImageData = { file, image: img };
            else backImageData = { file, image: img };

            displayPreview(side, img);
            if (cvReady) processImage(side, img);
            else showStatus('Waiting for detection engine to finish loading...', 'info');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function displayPreview(side, img) {
    document.getElementById(`${side}Preview`).style.display = 'block';
    document.getElementById(`${side}Image`).src = img.src;
}

function processImage(side, img) {
    try {
        const bbox = detectCardBoundingBox(img);
        const imageData = side === 'front' ? frontImageData : backImageData;
        imageData.detectedBox = bbox;
        drawCardOutline(side);

        if (bbox.detected) {
            showStatus(`${cap(side)} card detected`, 'success');
        } else {
            showStatus(`No clear card outline in ${side} image — using full frame. Adjust buffer or recrop manually.`, 'info');
        }
    } catch (error) {
        console.error(`Error processing ${side} image:`, error);
        showStatus(`Error processing ${side} image`, 'error');
    }

    if (frontImageData && backImageData) {
        document.getElementById('processingSection').style.display = 'block';
        document.getElementById('exportSection').style.display = 'block';
    }
}

// Edge + contour based card detection. Returns {x,y,width,height,detected}.
function detectCardBoundingBox(img) {
    const cv = window.cv;
    const W = img.width, H = img.height;

    // Downscale very large images for speed; we'll scale the bbox back up.
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(W, H));
    const work = document.createElement('canvas');
    work.width = Math.round(W * scale);
    work.height = Math.round(H * scale);
    work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);

    const src = cv.imread(work);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const dilated = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);

    let result = { x: 0, y: 0, width: W, height: H, detected: false };

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        // Canny with auto-ish thresholds based on median would be ideal; fixed values work for typical photos.
        cv.Canny(blurred, edges, 50, 150);
        cv.dilate(edges, dilated, kernel);
        cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const minArea = work.width * work.height * 0.05;
        const maxArea = work.width * work.height * 0.98;
        let best = null;
        let bestScore = 0;

        for (let i = 0; i < contours.size(); i++) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            if (area < minArea || area > maxArea) { cnt.delete(); continue; }

            const rect = cv.boundingRect(cnt);
            const aspect = rect.width / rect.height;
            // Cards (slabs) typically have aspect 0.6–0.85 portrait or 1.2–1.7 landscape.
            const aspectScore = (aspect > 0.5 && aspect < 0.95) || (aspect > 1.05 && aspect < 2.0) ? 1 : 0.4;
            // Rectangularity: contour area vs bounding rect area
            const rectArea = rect.width * rect.height;
            const fill = area / rectArea;
            const score = area * aspectScore * fill;

            if (score > bestScore) {
                bestScore = score;
                best = rect;
            }
            cnt.delete();
        }

        if (best) {
            result = {
                x: Math.round(best.x / scale),
                y: Math.round(best.y / scale),
                width: Math.round(best.width / scale),
                height: Math.round(best.height / scale),
                detected: true
            };
        }
    } finally {
        src.delete(); gray.delete(); blurred.delete(); edges.delete();
        dilated.delete(); contours.delete(); hierarchy.delete(); kernel.delete();
    }

    return result;
}

function drawCardOutline(side) {
    const imageData = side === 'front' ? frontImageData : backImageData;
    if (!imageData || !imageData.detectedBox) return;

    const canvas = document.getElementById(`${side}Canvas`);
    const ctx = canvas.getContext('2d');
    const bbox = imageData.detectedBox;

    canvas.width = imageData.image.width;
    canvas.height = imageData.image.height;
    ctx.drawImage(imageData.image, 0, 0);

    const buffer = parseInt(document.getElementById(`${side}Buffer`).value) || 0;
    const x = Math.max(0, bbox.x - buffer);
    const y = Math.max(0, bbox.y - buffer);
    const w = Math.min(canvas.width - x, bbox.width + 2 * buffer);
    const h = Math.min(canvas.height - y, bbox.height + 2 * buffer);

    ctx.strokeStyle = bbox.detected ? '#00ff00' : '#ff8800';
    ctx.lineWidth = Math.max(3, Math.round(canvas.width * 0.004));
    ctx.strokeRect(x, y, w, h);

    const cornerSize = Math.max(20, Math.round(canvas.width * 0.03));
    const t = Math.max(3, Math.round(canvas.width * 0.005));
    ctx.fillStyle = ctx.strokeStyle;
    [[x, y], [x + w - cornerSize, y], [x, y + h - cornerSize], [x + w - cornerSize, y + h - cornerSize]].forEach(([cx, cy]) => {
        ctx.fillRect(cx, cy, cornerSize, t);
        ctx.fillRect(cx, cy, t, cornerSize);
    });

    imageData.boundingBox = { x, y, w, h };
}

function reprocessImages() {
    if (frontImageData && frontImageData.detectedBox) drawCardOutline('front');
    if (backImageData && backImageData.detectedBox) drawCardOutline('back');
}

function clearImage(side) {
    if (side === 'front') {
        frontImageData = null;
        document.getElementById('frontInput').value = '';
    } else {
        backImageData = null;
        document.getElementById('backInput').value = '';
    }

    document.getElementById(`${side}Preview`).style.display = 'none';
    const canvas = document.getElementById(`${side}Canvas`);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    if (!frontImageData || !backImageData) {
        document.getElementById('processingSection').style.display = 'none';
        document.getElementById('exportSection').style.display = 'none';
    }
}

function exportImages() {
    const name = document.getElementById('exportName').value.trim();
    if (!name) { showStatus('Please enter a card name/ID', 'error'); return; }
    if (!frontImageData?.boundingBox || !backImageData?.boundingBox) {
        showStatus('Images not ready for export', 'error');
        return;
    }

    try {
        showStatus('Exporting images...', 'info');
        downloadImage(cropImage(frontImageData), `${name}_front.jpg`);
        downloadImage(cropImage(backImageData), `${name}_back.jpg`);
        showStatus(`Exported: ${name}_front.jpg and ${name}_back.jpg`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showStatus('Error exporting images', 'error');
    }
}

function cropImage(imageData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const bbox = imageData.boundingBox;
    canvas.width = bbox.w;
    canvas.height = bbox.h;
    ctx.drawImage(imageData.image, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
    return canvas;
}

function downloadImage(canvas, filename) {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function showStatus(message, type = 'info') {
    const alert = document.getElementById('statusAlert');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    if (type !== 'error') {
        clearTimeout(showStatus._t);
        showStatus._t = setTimeout(() => { alert.style.display = 'none'; }, 4000);
    }
}
