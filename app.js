// State per side
// quad = [TL, TR, BR, BL] in image coords. null until user draws.
const state = {
    front: { image: null, quad: null, drawing: false, drawStart: null, dragIdx: null },
    back:  { image: null, quad: null, drawing: false, drawStart: null, dragIdx: null }
};
let cvReady = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupDropZones();
    setupFileInputs();
    ['front', 'back'].forEach(setupCanvasInteractions);

    showStatus('Loading export engine...', 'info');
    await waitForOpenCV();
    cvReady = true;
    showStatus('Ready — upload a front and back photo, then draw rectangles.', 'success');
});

function waitForOpenCV() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.cv && typeof window.cv.Mat === 'function') return resolve();
            if (window.__cvReady && window.cv) {
                const prev = window.cv['onRuntimeInitialized'];
                window.cv['onRuntimeInitialized'] = () => { prev && prev(); resolve(); };
                return;
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
            state[side].image = img;
            state[side].quad = null;
            displayPreview(side, img);
            renderCanvas(side);
            updateLayout();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function displayPreview(side, img) {
    document.getElementById(`${side}DropZone`).classList.add('has-image');
    document.getElementById(`${side}Image`).src = img.src;
}

function updateLayout() {
    const bothLoaded = state.front.image && state.back.image;
    document.getElementById('uploadSection').classList.toggle('compact', bothLoaded);
    document.getElementById('processingSection').style.display = bothLoaded ? 'block' : 'none';
    document.getElementById('exportSection').style.display = bothLoaded ? 'block' : 'none';
}

// ---------- Canvas interactions ----------

function setupCanvasInteractions(side) {
    const canvas = document.getElementById(`${side}Canvas`);
    canvas.addEventListener('mousedown', (e) => onPointerDown(side, e));
    canvas.addEventListener('mousemove', (e) => onPointerMove(side, e));
    window.addEventListener('mouseup', (e) => onPointerUp(side, e));
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(side, e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); onPointerMove(side, e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend',   (e) => { e.preventDefault(); onPointerUp(side, e.changedTouches[0]); }, { passive: false });
}

function eventToImageCoords(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
    };
}

function cornerHitRadius(canvas) {
    return Math.max(20, canvas.width * 0.025);
}

function findCornerHit(quad, pt, radius) {
    if (!quad) return -1;
    let best = -1;
    let bestDist = radius * radius;
    for (let i = 0; i < 4; i++) {
        const dx = quad[i].x - pt.x;
        const dy = quad[i].y - pt.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestDist) { bestDist = d2; best = i; }
    }
    return best;
}

function onPointerDown(side, e) {
    const s = state[side];
    if (!s.image) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);

    if (s.quad) {
        const idx = findCornerHit(s.quad, pt, cornerHitRadius(canvas));
        if (idx >= 0) {
            s.dragIdx = idx;
            canvas.classList.add('dragging-corner');
            return;
        }
        // Existing quad and click was outside any corner → no-op (use Clear button to start over)
        return;
    }

    // No quad yet → begin drawing initial axis-aligned rect
    s.drawing = true;
    s.drawStart = pt;
    s.quad = [{ ...pt }, { ...pt }, { ...pt }, { ...pt }];
    renderCanvas(side);
}

function onPointerMove(side, e) {
    const s = state[side];
    if (!s.image) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);

    if (s.drawing) {
        const x1 = s.drawStart.x, y1 = s.drawStart.y;
        const x2 = pt.x, y2 = pt.y;
        const xmin = Math.min(x1, x2), xmax = Math.max(x1, x2);
        const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2);
        s.quad = [
            { x: xmin, y: ymin }, // TL
            { x: xmax, y: ymin }, // TR
            { x: xmax, y: ymax }, // BR
            { x: xmin, y: ymax }  // BL
        ];
        renderCanvas(side);
    } else if (s.dragIdx !== null) {
        // Clamp to image bounds
        s.quad[s.dragIdx] = {
            x: Math.max(0, Math.min(s.image.width, pt.x)),
            y: Math.max(0, Math.min(s.image.height, pt.y))
        };
        renderCanvas(side);
    }
}

function onPointerUp(side) {
    const s = state[side];
    const canvas = document.getElementById(`${side}Canvas`);
    if (s.drawing) {
        s.drawing = false;
        s.drawStart = null;
        // If the rect is too tiny (a misclick), discard it
        const w = s.quad[1].x - s.quad[0].x;
        const h = s.quad[3].y - s.quad[0].y;
        if (w < 10 || h < 10) s.quad = null;
        renderCanvas(side);
    }
    if (s.dragIdx !== null) {
        s.dragIdx = null;
        canvas.classList.remove('dragging-corner');
    }
}

// ---------- Rendering ----------

function renderCanvas(side) {
    const s = state[side];
    const canvas = document.getElementById(`${side}Canvas`);
    if (!s.image) return;

    canvas.width = s.image.width;
    canvas.height = s.image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(s.image, 0, 0);

    if (!s.quad) return;

    const lineWidth = Math.max(3, canvas.width * 0.004);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(s.quad[0].x, s.quad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(s.quad[i].x, s.quad[i].y);
    ctx.closePath();
    ctx.stroke();

    // Corner handles
    const r = Math.max(10, canvas.width * 0.012);
    for (let i = 0; i < 4; i++) {
        const c = s.quad[i];
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
        ctx.lineWidth = lineWidth * 0.6;
        ctx.strokeStyle = '#003300';
        ctx.stroke();
    }
}

// ---------- Quad management ----------

function clearQuad(side) {
    state[side].quad = null;
    renderCanvas(side);
}

function copyQuadFromFront() {
    if (!state.front.quad) {
        showStatus('Draw a rectangle on the front photo first', 'error');
        return;
    }
    if (!state.back.image) {
        showStatus('Upload a back photo first', 'error');
        return;
    }
    // Scale front quad coords to back image's coordinate space (in case dimensions differ)
    const fW = state.front.image.width, fH = state.front.image.height;
    const bW = state.back.image.width,  bH = state.back.image.height;
    const sx = bW / fW, sy = bH / fH;
    state.back.quad = state.front.quad.map(p => ({ x: p.x * sx, y: p.y * sy }));
    renderCanvas('back');
    showStatus('Copied front rectangle to back — drag corners to fine-tune', 'success');
}

function clearImage(side) {
    state[side].image = null;
    state[side].quad = null;
    document.getElementById(`${side}Input`).value = '';
    document.getElementById(`${side}DropZone`).classList.remove('has-image');
    document.getElementById(`${side}Image`).src = '';
    const canvas = document.getElementById(`${side}Canvas`);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    updateLayout();
}

// ---------- Export ----------

function exportImages() {
    const name = document.getElementById('exportName').value.trim();
    if (!name) { showStatus('Please enter a card name/ID', 'error'); return; }
    if (!state.front.quad || !state.back.quad) {
        showStatus('Draw a rectangle on both front and back photos first', 'error');
        return;
    }
    if (!cvReady) { showStatus('Export engine still loading, try again in a moment', 'error'); return; }

    try {
        showStatus('Exporting images...', 'info');
        downloadImage(warpQuadToCanvas(state.front), `${name}_front.jpg`);
        downloadImage(warpQuadToCanvas(state.back),  `${name}_back.jpg`);
        showStatus(`Exported: ${name}_front.jpg and ${name}_back.jpg`, 'success');
    } catch (err) {
        console.error('Export error:', err);
        showStatus('Error exporting images', 'error');
    }
}

function warpQuadToCanvas(s) {
    const cv = window.cv;
    const [tl, tr, br, bl] = s.quad;
    const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const widthBot = Math.hypot(br.x - bl.x, br.y - bl.y);
    const heightL  = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const heightR  = Math.hypot(br.x - tr.x, br.y - tr.y);
    const W = Math.max(1, Math.round(Math.max(widthTop, widthBot)));
    const H = Math.max(1, Math.round(Math.max(heightL, heightR)));

    const tmp = document.createElement('canvas');
    tmp.width = s.image.width;
    tmp.height = s.image.height;
    tmp.getContext('2d').drawImage(s.image, 0, 0);

    const src = cv.imread(tmp);
    const dst = new cv.Mat();
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(src, dst, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    cv.imshow(out, dst);

    src.delete(); dst.delete(); srcPts.delete(); dstPts.delete(); M.delete();
    return out;
}

function downloadImage(canvas, filename) {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

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
