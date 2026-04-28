// State
const state = {
    front: { image: null, rects: [] },  // rects: axis-aligned [{x1,y1,x2,y2}]
    back:  { image: null, rects: [] },
    active: null,  // current interaction
    cards: [],     // saved card pairs accumulated across scans
    nextCardId: 1
};

document.addEventListener('DOMContentLoaded', () => {
    setupDropZones();
    setupCanvasReplaceDrops();
    setupFileInputs();
    ['front', 'back'].forEach(setupCanvasInteractions);
    showStatus('Upload a front and back photo to begin', 'info');
});

// ---------- Upload handling ----------

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

function setupCanvasReplaceDrops() {
    ['front', 'back'].forEach(side => {
        const c = document.getElementById(`${side}CanvasContainer`);
        c.addEventListener('dragover', (e) => { e.preventDefault(); c.classList.add('drag-over'); });
        c.addEventListener('dragleave', () => c.classList.remove('drag-over'));
        c.addEventListener('drop', (e) => {
            e.preventDefault();
            c.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files[0], side);
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
            // Replacing an image discards rects on both sides (they may not align with the new photo)
            state.front.rects = [];
            state.back.rects = [];
            displayPreview(side, img);
            if (state.front.image) renderCanvas('front');
            if (state.back.image) renderCanvas('back');
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
    const both = state.front.image && state.back.image;
    document.getElementById('uploadSection').style.display = both ? 'none' : '';
    document.getElementById('processingSection').style.display = both ? 'block' : 'none';
    document.getElementById('savedSection').style.display = state.cards.length > 0 ? 'block' : 'none';
}

function clearImage(side) {
    state[side].image = null;
    state.front.rects = [];
    state.back.rects = [];
    document.getElementById(`${side}Input`).value = '';
    document.getElementById(`${side}DropZone`).classList.remove('has-image');
    document.getElementById(`${side}Image`).src = '';
    const canvas = document.getElementById(`${side}Canvas`);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    const other = side === 'front' ? 'back' : 'front';
    if (state[other].image) renderCanvas(other);
    updateLayout();
}

function nextScan() {
    state.front.image = null;
    state.back.image = null;
    state.front.rects = [];
    state.back.rects = [];
    ['front', 'back'].forEach(side => {
        document.getElementById(`${side}Input`).value = '';
        document.getElementById(`${side}DropZone`).classList.remove('has-image');
        document.getElementById(`${side}Image`).src = '';
    });
    updateLayout();
    showStatus('Upload the next pair of photos', 'info');
}

// ---------- Canvas interactions ----------

function setupCanvasInteractions(side) {
    const canvas = document.getElementById(`${side}Canvas`);
    canvas.addEventListener('mousedown', (e) => onPointerDown(side, e));
    canvas.addEventListener('mousemove', (e) => onPointerMove(side, e));
    window.addEventListener('mouseup', () => onPointerUp());
    canvas.addEventListener('contextmenu', (e) => onContextMenu(side, e));
}

function eventToImageCoords(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
    };
}

function rectCorners(r) {
    return [
        { x: r.x1, y: r.y1 }, // 0 = top-left
        { x: r.x2, y: r.y1 }, // 1 = top-right
        { x: r.x2, y: r.y2 }, // 2 = bottom-right
        { x: r.x1, y: r.y2 }  // 3 = bottom-left
    ];
}

function hitTest(side, pt) {
    const rects = state[side].rects;
    const canvas = document.getElementById(`${side}Canvas`);
    const cornerR = Math.max(20, canvas.width * 0.025);
    for (let i = rects.length - 1; i >= 0; i--) {
        const corners = rectCorners(rects[i]);
        for (let c = 0; c < 4; c++) {
            const dx = corners[c].x - pt.x, dy = corners[c].y - pt.y;
            if (dx * dx + dy * dy <= cornerR * cornerR) {
                return { hit: 'corner', rectIdx: i, cornerIdx: c };
            }
        }
        const r = rects[i];
        const xmin = Math.min(r.x1, r.x2), xmax = Math.max(r.x1, r.x2);
        const ymin = Math.min(r.y1, r.y2), ymax = Math.max(r.y1, r.y2);
        if (pt.x >= xmin && pt.x <= xmax && pt.y >= ymin && pt.y <= ymax) {
            return { hit: 'body', rectIdx: i };
        }
    }
    return { hit: 'empty' };
}

function onPointerDown(side, e) {
    if (!state[side].image) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);
    const ht = hitTest(side, pt);

    if (ht.hit === 'corner') {
        state.active = { kind: 'resize', side, rectIdx: ht.rectIdx, cornerIdx: ht.cornerIdx };
    } else if (ht.hit === 'body') {
        state.active = {
            kind: 'move',
            side,
            rectIdx: ht.rectIdx,
            startPt: pt,
            origRect: { ...state[side].rects[ht.rectIdx] }
        };
    } else {
        // Begin drawing a new rect (corner-to-corner)
        const newRect = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
        state[side].rects.push(newRect);
        // Mirror to the other side immediately, scaled to that image's dimensions
        const other = side === 'front' ? 'back' : 'front';
        if (state[other].image) {
            const sx = state[other].image.width / state[side].image.width;
            const sy = state[other].image.height / state[side].image.height;
            state[other].rects.push({
                x1: newRect.x1 * sx, y1: newRect.y1 * sy,
                x2: newRect.x2 * sx, y2: newRect.y2 * sy
            });
            renderCanvas(other);
        }
        state.active = { kind: 'draw', side, mirrorScaleX: 1, mirrorScaleY: 1 };
        if (state[other].image) {
            state.active.mirrorScaleX = state[other].image.width / state[side].image.width;
            state.active.mirrorScaleY = state[other].image.height / state[side].image.height;
        }
    }
    renderCanvas(side);
}

function onPointerMove(side, e) {
    if (!state.active || state.active.side !== side) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);
    const a = state.active;

    if (a.kind === 'draw') {
        const rect = state[side].rects[state[side].rects.length - 1];
        rect.x2 = pt.x; rect.y2 = pt.y;
        renderCanvas(side);
        const other = side === 'front' ? 'back' : 'front';
        if (state[other].rects.length === state[side].rects.length) {
            const otherRect = state[other].rects[state[other].rects.length - 1];
            otherRect.x2 = pt.x * a.mirrorScaleX;
            otherRect.y2 = pt.y * a.mirrorScaleY;
            renderCanvas(other);
        }
    } else if (a.kind === 'resize') {
        const rect = state[side].rects[a.rectIdx];
        if (a.cornerIdx === 0) { rect.x1 = pt.x; rect.y1 = pt.y; }
        else if (a.cornerIdx === 1) { rect.x2 = pt.x; rect.y1 = pt.y; }
        else if (a.cornerIdx === 2) { rect.x2 = pt.x; rect.y2 = pt.y; }
        else if (a.cornerIdx === 3) { rect.x1 = pt.x; rect.y2 = pt.y; }
        renderCanvas(side);
    } else if (a.kind === 'move') {
        const dx = pt.x - a.startPt.x, dy = pt.y - a.startPt.y;
        const rect = state[side].rects[a.rectIdx];
        rect.x1 = a.origRect.x1 + dx;
        rect.x2 = a.origRect.x2 + dx;
        rect.y1 = a.origRect.y1 + dy;
        rect.y2 = a.origRect.y2 + dy;
        renderCanvas(side);
    }
}

function onPointerUp() {
    if (!state.active) return;
    const side = state.active.side;
    if (side) {
        // Normalize all rects so x1<x2, y1<y2; drop tiny accidental rects
        ['front', 'back'].forEach(s => {
            state[s].rects = state[s].rects.map(r => ({
                x1: Math.min(r.x1, r.x2),
                x2: Math.max(r.x1, r.x2),
                y1: Math.min(r.y1, r.y2),
                y2: Math.max(r.y1, r.y2)
            }));
        });
        // If the just-drawn rect is too tiny on the active side, drop the matching index from both sides
        if (state.active.kind === 'draw') {
            const rects = state[side].rects;
            if (rects.length > 0) {
                const last = rects[rects.length - 1];
                if ((last.x2 - last.x1) < 5 || (last.y2 - last.y1) < 5) {
                    state.front.rects.pop();
                    state.back.rects.pop();
                }
            }
        }
        renderCanvas('front');
        renderCanvas('back');
    }
    state.active = null;
}

function onContextMenu(side, e) {
    e.preventDefault();
    if (!state[side].image) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);
    const ht = hitTest(side, pt);
    if (ht.hit === 'corner' || ht.hit === 'body') {
        // Delete this rect from both sides to keep pairs in sync
        state.front.rects.splice(ht.rectIdx, 1);
        state.back.rects.splice(ht.rectIdx, 1);
        renderCanvas('front');
        renderCanvas('back');
    }
}

function clearAllRects() {
    state.front.rects = [];
    state.back.rects = [];
    renderCanvas('front');
    renderCanvas('back');
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
    s.rects.forEach((r, i) => drawRect(ctx, r, i + 1, canvas.width));
}

function drawRect(ctx, rect, label, refWidth) {
    const lw = Math.max(3, refWidth * 0.004);
    const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2);
    const w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);

    const r = Math.max(10, refWidth * 0.012);
    ctx.fillStyle = '#00ff00';
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = lw * 0.6;
    for (const c of rectCorners(rect)) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Number badge
    const fontSize = Math.max(20, refWidth * 0.025);
    ctx.font = `bold ${fontSize}px sans-serif`;
    const text = String(label);
    const padding = fontSize * 0.4;
    const tw = ctx.measureText(text).width + padding * 2;
    const th = fontSize * 1.2 + padding * 2;
    const bx = x + 8, by = y + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(bx, by, tw, th);
    ctx.fillStyle = '#00ff00';
    ctx.textBaseline = 'top';
    ctx.fillText(text, bx + padding, by + padding);
}

// ---------- Save scan -> cards queue ----------

function saveCardsFromScan() {
    if (state.front.rects.length === 0) {
        showStatus('Draw at least one rectangle first', 'error');
        return;
    }
    if (state.front.rects.length !== state.back.rects.length) {
        showStatus('Front and back must have the same number of rectangles', 'error');
        return;
    }
    for (let i = 0; i < state.front.rects.length; i++) {
        state.cards.push({
            id: state.nextCardId++,
            frontCanvas: cropRect(state.front.image, state.front.rects[i]),
            backCanvas:  cropRect(state.back.image,  state.back.rects[i]),
            frontRotation: 0,
            backRotation: 0,
            certNumber: ''
        });
    }
    const count = state.front.rects.length;
    state.front.rects = [];
    state.back.rects = [];
    renderCanvas('front');
    renderCanvas('back');
    renderSavedGrid();
    updateLayout();
    showStatus(`Saved ${count} card${count > 1 ? 's' : ''} — upload the next scan or download all`, 'success');
}

function cropRect(image, rect) {
    const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2);
    const w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    c.getContext('2d').drawImage(image, x, y, w, h, 0, 0, c.width, c.height);
    return c;
}

// ---------- Saved cards grid ----------

function renderSavedGrid() {
    const grid = document.getElementById('savedGrid');
    document.getElementById('savedCount').textContent = state.cards.length;
    grid.innerHTML = '';
    state.cards.forEach(card => grid.appendChild(buildCardCell(card)));
}

function buildCardCell(card) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    col.innerHTML = `
        <div class="border rounded p-2 saved-card">
            <div class="d-flex gap-2 mb-2">
                <div class="flex-grow-1 text-center">
                    <small class="text-muted d-block">Front</small>
                    <div class="thumb-wrap mb-1" data-thumb="front"></div>
                    <button class="btn btn-sm btn-outline-secondary" data-action="rotate-front">Rotate 90&deg;</button>
                </div>
                <div class="flex-grow-1 text-center">
                    <small class="text-muted d-block">Back</small>
                    <div class="thumb-wrap mb-1" data-thumb="back"></div>
                    <button class="btn btn-sm btn-outline-secondary" data-action="rotate-back">Rotate 90&deg;</button>
                </div>
            </div>
            <input type="text" class="form-control form-control-sm mb-2 cert-input" placeholder="Cert number" value="${escapeHtml(card.certNumber || '')}">
            <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted">Card #${card.id}</small>
                <div>
                    <button class="btn btn-sm btn-outline-primary" data-action="download">Download</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="remove">Remove</button>
                </div>
            </div>
        </div>
    `;
    col.querySelector('[data-thumb=front]').appendChild(rotatedThumb(card.frontCanvas, card.frontRotation));
    col.querySelector('[data-thumb=back]').appendChild(rotatedThumb(card.backCanvas, card.backRotation));

    col.querySelector('[data-action=rotate-front]').onclick = () => {
        card.frontRotation = (card.frontRotation + 90) % 360;
        renderSavedGrid();
    };
    col.querySelector('[data-action=rotate-back]').onclick = () => {
        card.backRotation = (card.backRotation + 90) % 360;
        renderSavedGrid();
    };
    col.querySelector('[data-action=download]').onclick = () => downloadCard(card);
    col.querySelector('[data-action=remove]').onclick = () => {
        state.cards = state.cards.filter(c => c.id !== card.id);
        renderSavedGrid();
        updateLayout();
    };
    col.querySelector('.cert-input').oninput = (e) => { card.certNumber = e.target.value.trim(); };
    return col;
}

function rotatedThumb(srcCanvas, deg) {
    const rotated = rotateCanvas(srcCanvas, deg);
    const img = document.createElement('img');
    img.src = rotated.toDataURL('image/jpeg', 0.85);
    img.className = 'saved-thumb-img';
    return img;
}

function rotateCanvas(srcCanvas, deg) {
    const norm = ((deg % 360) + 360) % 360;
    if (norm === 0) return srcCanvas;
    const c = document.createElement('canvas');
    if (norm === 180) {
        c.width = srcCanvas.width;
        c.height = srcCanvas.height;
    } else {
        c.width = srcCanvas.height;
        c.height = srcCanvas.width;
    }
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(norm * Math.PI / 180);
    ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
    return c;
}

// ---------- Download ----------

function downloadCard(card) {
    const fc = rotateCanvas(card.frontCanvas, card.frontRotation);
    const bc = rotateCanvas(card.backCanvas, card.backRotation);
    const base = card.certNumber && card.certNumber.length > 0
        ? sanitizeFilename(card.certNumber)
        : `card_${String(card.id).padStart(3, '0')}`;
    downloadCanvas(fc, `${base}_front.jpg`);
    downloadCanvas(bc, `${base}_back.jpg`);
}

function downloadCanvas(canvas, filename) {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadAll() {
    if (state.cards.length === 0) { showStatus('Nothing to download', 'error'); return; }
    state.cards.forEach(c => downloadCard(c));
    const rows = [['card_id', 'cert_number', 'front_filename', 'back_filename']];
    state.cards.forEach(card => {
        const base = card.certNumber && card.certNumber.length > 0
            ? sanitizeFilename(card.certNumber)
            : `card_${String(card.id).padStart(3, '0')}`;
        rows.push([card.id, card.certNumber || '', `${base}_front.jpg`, `${base}_back.jpg`]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cards.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus(`Downloaded ${state.cards.length} card pair${state.cards.length > 1 ? 's' : ''} + cards.csv`, 'success');
}

function clearAllSaved() {
    if (state.cards.length === 0) return;
    if (!confirm(`Remove all ${state.cards.length} saved cards?`)) return;
    state.cards = [];
    renderSavedGrid();
    updateLayout();
}

// ---------- Helpers ----------

function sanitizeFilename(s) {
    return s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'card';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
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
