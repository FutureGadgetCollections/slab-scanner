// State
const state = {
    front: { image: null, rects: [] },  // rect: {x1,y1,x2,y2,locked}
    back:  { image: null, rects: [] },
    active: null,
    cards: [],
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
        { x: r.x1, y: r.y1 },
        { x: r.x2, y: r.y1 },
        { x: r.x2, y: r.y2 },
        { x: r.x1, y: r.y2 }
    ];
}

function deleteBadgeBox(rect, refWidth) {
    // Returns the bounding box of the × delete badge (top-right of the rect)
    const size = Math.max(28, refWidth * 0.035);
    const xmax = Math.max(rect.x1, rect.x2);
    const ymin = Math.min(rect.y1, rect.y2);
    return { x: xmax - size, y: ymin, w: size, h: size };
}

function hitTest(side, pt) {
    const rects = state[side].rects;
    const canvas = document.getElementById(`${side}Canvas`);
    const cornerR = Math.max(20, canvas.width * 0.025);

    // Pass 1: × delete badges (always hit-testable, even on locked rects)
    for (let i = rects.length - 1; i >= 0; i--) {
        const b = deleteBadgeBox(rects[i], canvas.width);
        if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
            return { hit: 'delete', rectIdx: i };
        }
    }
    // Pass 2: corners + body (only on unlocked rects)
    for (let i = rects.length - 1; i >= 0; i--) {
        if (rects[i].locked) continue;
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
    // Pass 3: a click inside a locked rect should not start a new draw — absorb it
    for (let i = rects.length - 1; i >= 0; i--) {
        if (!rects[i].locked) continue;
        const r = rects[i];
        const xmin = Math.min(r.x1, r.x2), xmax = Math.max(r.x1, r.x2);
        const ymin = Math.min(r.y1, r.y2), ymax = Math.max(r.y1, r.y2);
        if (pt.x >= xmin && pt.x <= xmax && pt.y >= ymin && pt.y <= ymax) {
            return { hit: 'locked-body', rectIdx: i };
        }
    }
    return { hit: 'empty' };
}

function onPointerDown(side, e) {
    if (e.button !== undefined && e.button !== 0) return; // only left click
    if (!state[side].image) return;
    const canvas = document.getElementById(`${side}Canvas`);
    const pt = eventToImageCoords(canvas, e);
    const ht = hitTest(side, pt);

    if (ht.hit === 'delete') {
        state.front.rects.splice(ht.rectIdx, 1);
        state.back.rects.splice(ht.rectIdx, 1);
        renderCanvas('front');
        renderCanvas('back');
        return;
    }
    if (ht.hit === 'locked-body') return; // absorb click; no draw, no move
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
        // Begin drawing a new rect
        const newRect = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, locked: false };
        state[side].rects.push(newRect);
        const other = side === 'front' ? 'back' : 'front';
        let mirrorScaleX = 1, mirrorScaleY = 1;
        if (state[other].image) {
            mirrorScaleX = state[other].image.width / state[side].image.width;
            mirrorScaleY = state[other].image.height / state[side].image.height;
            state[other].rects.push({
                x1: newRect.x1 * mirrorScaleX, y1: newRect.y1 * mirrorScaleY,
                x2: newRect.x2 * mirrorScaleX, y2: newRect.y2 * mirrorScaleY,
                locked: false
            });
            renderCanvas(other);
        }
        state.active = { kind: 'draw', side, mirrorScaleX, mirrorScaleY };
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
        if (rect.locked) return;
        if (a.cornerIdx === 0) { rect.x1 = pt.x; rect.y1 = pt.y; }
        else if (a.cornerIdx === 1) { rect.x2 = pt.x; rect.y1 = pt.y; }
        else if (a.cornerIdx === 2) { rect.x2 = pt.x; rect.y2 = pt.y; }
        else if (a.cornerIdx === 3) { rect.x1 = pt.x; rect.y2 = pt.y; }
        renderCanvas(side);
    } else if (a.kind === 'move') {
        const rect = state[side].rects[a.rectIdx];
        if (rect.locked) return;
        const dx = pt.x - a.startPt.x, dy = pt.y - a.startPt.y;
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
        ['front', 'back'].forEach(s => {
            state[s].rects = state[s].rects.map(r => ({
                ...r,
                x1: Math.min(r.x1, r.x2),
                x2: Math.max(r.x1, r.x2),
                y1: Math.min(r.y1, r.y2),
                y2: Math.max(r.y1, r.y2)
            }));
        });
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
    // Right-click on a rect (any state) toggles its locked flag — same index on both sides
    if (ht.hit === 'corner' || ht.hit === 'body' || ht.hit === 'locked-body') {
        const newLocked = !state[side].rects[ht.rectIdx].locked;
        state.front.rects[ht.rectIdx].locked = newLocked;
        state.back.rects[ht.rectIdx].locked = newLocked;
        renderCanvas('front');
        renderCanvas('back');
        showStatus(newLocked ? `Rectangle ${ht.rectIdx + 1} committed (right-click again to unlock)` : `Rectangle ${ht.rectIdx + 1} unlocked`, 'info');
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

    const colorMain = rect.locked ? '#2196f3' : '#00ff00';
    const colorDark = rect.locked ? '#0b3d91' : '#003300';

    ctx.strokeStyle = colorMain;
    ctx.lineWidth = lw;
    if (rect.locked) ctx.setLineDash([Math.max(8, refWidth * 0.012), Math.max(6, refWidth * 0.008)]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Corner handles only on unlocked rects (they're the drag targets)
    if (!rect.locked) {
        const r = Math.max(10, refWidth * 0.012);
        ctx.fillStyle = colorMain;
        ctx.strokeStyle = colorDark;
        ctx.lineWidth = lw * 0.6;
        for (const c of rectCorners(rect)) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    // Number badge (top-left)
    const fontSize = Math.max(20, refWidth * 0.025);
    ctx.font = `bold ${fontSize}px sans-serif`;
    const text = String(label) + (rect.locked ? '  \u{1F512}' : '');
    const padding = fontSize * 0.4;
    const tw = ctx.measureText(text).width + padding * 2;
    const th = fontSize * 1.2 + padding * 2;
    const bx = x + 8, by = y + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(bx, by, tw, th);
    ctx.fillStyle = colorMain;
    ctx.textBaseline = 'top';
    ctx.fillText(text, bx + padding, by + padding);

    // × delete badge (top-right)
    const b = deleteBadgeBox(rect, refWidth);
    ctx.fillStyle = 'rgba(220, 53, 69, 0.95)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, refWidth * 0.003);
    ctx.beginPath();
    const pad = b.w * 0.25;
    ctx.moveTo(b.x + pad, b.y + pad);
    ctx.lineTo(b.x + b.w - pad, b.y + b.h - pad);
    ctx.moveTo(b.x + b.w - pad, b.y + pad);
    ctx.lineTo(b.x + pad, b.y + b.h - pad);
    ctx.stroke();
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
            certNumber: '',
            metadata: blankMetadata(),
            confirmed: false,
            source: ''
        });
    }
    const count = state.front.rects.length;
    state.front.rects = [];
    state.back.rects = [];
    renderCanvas('front');
    renderCanvas('back');
    renderSavedGrid();
    updateLayout();
    showStatus(`Saved ${count} card${count > 1 ? 's' : ''} — scan barcodes or fill in metadata`, 'success');
    // Best-effort auto-scan barcodes on the newly saved cards
    state.cards.slice(-count).forEach(card => tryAutoScanBarcode(card));
}

function blankMetadata() {
    return { subject: '', year: '', brand: '', set: '', cardNumber: '', variation: '', grade: '', sport: '' };
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

// ---------- Barcode scanning ----------

async function scanBarcodeFromCanvas(canvas) {
    if (!window.ZXing) throw new Error('Barcode library not loaded');
    const reader = new ZXing.BrowserMultiFormatReader();
    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    const result = await reader.decodeFromImageElement(img);
    return result.getText();
}

function extractCertFromBarcode(text) {
    if (!text) return '';
    // PSA PDF417 payloads typically contain a certification number as the longest
    // run of 7-12 digits. CGC QR codes embed a URL; pull the digits from it.
    const urlMatch = text.match(/(?:certnumber|cert|certification)[\W_]*?(\d{6,12})/i);
    if (urlMatch) return urlMatch[1];
    const digitRuns = text.match(/\d{6,12}/g);
    if (digitRuns && digitRuns.length) {
        return digitRuns.sort((a, b) => b.length - a.length)[0];
    }
    return text.trim();
}

async function tryAutoScanBarcode(card) {
    try {
        const raw = await scanBarcodeFromCanvas(card.frontCanvas);
        const cert = extractCertFromBarcode(raw);
        if (cert && !card.certNumber) {
            card.certNumber = cert;
            // Update the visible input without re-rendering the whole grid
            const input = document.querySelector(`[data-card-id="${card.id}"] .cert-input`);
            if (input) input.value = cert;
        }
    } catch {
        // Silent fail — barcode not readable
    }
}

async function manualBarcodeScan(cardId) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    showStatus('Scanning barcode...', 'info');
    try {
        const raw = await scanBarcodeFromCanvas(card.frontCanvas);
        const cert = extractCertFromBarcode(raw);
        card.certNumber = cert;
        renderSavedGrid();
        showStatus(`Decoded: ${cert}`, 'success');
    } catch (err) {
        showStatus('No barcode found in this image — enter cert number manually', 'error');
    }
}

// ---------- Cert lookup ----------

function lookupCert(cardId, source) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    if (!card.certNumber && source !== 'manual') {
        showStatus('Enter or scan a cert number first', 'error');
        return;
    }
    card.source = source;
    if (source === 'psa') {
        const url = `https://www.psacard.com/cert/${encodeURIComponent(card.certNumber)}`;
        window.open(url, '_blank', 'noopener');
        showStatus('Opened PSA cert page — copy the details into the form below', 'info');
    } else if (source === 'cgc') {
        const url = `https://www.cgccards.com/certlookup/${encodeURIComponent(card.certNumber)}/`;
        window.open(url, '_blank', 'noopener');
        showStatus('Opened CGC cert page — copy the details into the form below', 'info');
    } else if (source === 'manual') {
        showStatus('Fill in the metadata below and click Confirm', 'info');
    }
    card.confirmed = false;
    renderSavedGrid();
}

function setMetadataField(cardId, field, value) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    card.metadata[field] = value;
}

function setCertNumber(cardId, value) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    card.certNumber = value.trim();
}

function confirmMetadata(cardId) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    card.confirmed = true;
    renderSavedGrid();
    showStatus(`Card #${card.id} confirmed`, 'success');
}

function unconfirmMetadata(cardId) {
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    card.confirmed = false;
    renderSavedGrid();
}

// ---------- Saved cards grid ----------

function renderSavedGrid() {
    const grid = document.getElementById('savedGrid');
    document.getElementById('savedCount').textContent = state.cards.length;
    grid.innerHTML = '';
    state.cards.forEach(card => grid.appendChild(buildCardCell(card)));
}

const META_FIELDS = [
    { key: 'subject', label: 'Subject / Player' },
    { key: 'year', label: 'Year' },
    { key: 'brand', label: 'Brand' },
    { key: 'set', label: 'Set' },
    { key: 'cardNumber', label: 'Card #' },
    { key: 'variation', label: 'Variation / Parallel' },
    { key: 'grade', label: 'Grade' },
    { key: 'sport', label: 'Sport / Category' }
];

function buildCardCell(card) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    col.dataset.cardId = String(card.id);

    const fieldRows = META_FIELDS.map(f => `
        <div class="meta-row">
            <label>${escapeHtml(f.label)}</label>
            <input type="text" class="form-control form-control-sm" data-meta="${f.key}" value="${escapeHtml(card.metadata[f.key] || '')}" ${card.confirmed ? 'disabled' : ''}>
        </div>
    `).join('');

    col.innerHTML = `
        <div class="border rounded p-2 saved-card ${card.confirmed ? 'confirmed' : ''}">
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

            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text">Cert #</span>
                <input type="text" class="form-control cert-input" placeholder="Enter or scan" value="${escapeHtml(card.certNumber || '')}" ${card.confirmed ? 'disabled' : ''}>
                <button class="btn btn-outline-primary" data-action="scan" ${card.confirmed ? 'disabled' : ''}>Scan barcode</button>
            </div>

            <div class="d-flex gap-1 mb-2 lookup-row">
                <button class="btn btn-sm btn-outline-secondary flex-grow-1 ${card.source === 'manual' ? 'active' : ''}" data-action="lookup-manual" ${card.confirmed ? 'disabled' : ''}>Manual</button>
                <button class="btn btn-sm btn-outline-secondary flex-grow-1 ${card.source === 'psa' ? 'active' : ''}" data-action="lookup-psa" ${card.confirmed ? 'disabled' : ''}>PSA lookup</button>
                <button class="btn btn-sm btn-outline-secondary flex-grow-1 ${card.source === 'cgc' ? 'active' : ''}" data-action="lookup-cgc" ${card.confirmed ? 'disabled' : ''}>CGC lookup</button>
            </div>

            <div class="meta-form">
                ${fieldRows}
            </div>

            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted">Card #${card.id}${card.source ? ' &middot; ' + escapeHtml(card.source.toUpperCase()) : ''}${card.confirmed ? ' &middot; <span class="text-success">Confirmed</span>' : ''}</small>
                <div>
                    ${card.confirmed
                        ? '<button class="btn btn-sm btn-outline-warning" data-action="unconfirm">Edit</button>'
                        : '<button class="btn btn-sm btn-success" data-action="confirm">Confirm</button>'}
                    <button class="btn btn-sm btn-outline-primary" data-action="download">Download</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="remove">Remove</button>
                </div>
            </div>
        </div>
    `;

    col.querySelector('[data-thumb=front]').appendChild(rotatedThumb(card.frontCanvas, card.frontRotation));
    col.querySelector('[data-thumb=back]').appendChild(rotatedThumb(card.backCanvas, card.backRotation));

    col.querySelector('[data-action=rotate-front]').onclick = () => { card.frontRotation = (card.frontRotation + 90) % 360; renderSavedGrid(); };
    col.querySelector('[data-action=rotate-back]').onclick = () => { card.backRotation = (card.backRotation + 90) % 360; renderSavedGrid(); };
    col.querySelector('[data-action=scan]').onclick = () => manualBarcodeScan(card.id);
    col.querySelector('[data-action=lookup-manual]').onclick = () => lookupCert(card.id, 'manual');
    col.querySelector('[data-action=lookup-psa]').onclick = () => lookupCert(card.id, 'psa');
    col.querySelector('[data-action=lookup-cgc]').onclick = () => lookupCert(card.id, 'cgc');
    col.querySelector('[data-action=download]').onclick = () => downloadCard(card);
    col.querySelector('[data-action=remove]').onclick = () => {
        state.cards = state.cards.filter(c => c.id !== card.id);
        renderSavedGrid();
        updateLayout();
    };
    const confirmBtn = col.querySelector('[data-action=confirm]');
    if (confirmBtn) confirmBtn.onclick = () => confirmMetadata(card.id);
    const unconfirmBtn = col.querySelector('[data-action=unconfirm]');
    if (unconfirmBtn) unconfirmBtn.onclick = () => unconfirmMetadata(card.id);

    col.querySelector('.cert-input').oninput = (e) => setCertNumber(card.id, e.target.value);
    col.querySelectorAll('[data-meta]').forEach(input => {
        input.oninput = (e) => setMetadataField(card.id, input.dataset.meta, e.target.value);
    });

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

function cardBaseFilename(card) {
    return card.certNumber && card.certNumber.length > 0
        ? sanitizeFilename(card.certNumber)
        : `card_${String(card.id).padStart(3, '0')}`;
}

function downloadCard(card) {
    const fc = rotateCanvas(card.frontCanvas, card.frontRotation);
    const bc = rotateCanvas(card.backCanvas, card.backRotation);
    const base = cardBaseFilename(card);
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

    const headers = ['card_id', 'cert_number', 'source', 'confirmed', ...META_FIELDS.map(f => f.key), 'front_filename', 'back_filename'];
    const rows = [headers];
    state.cards.forEach(card => {
        const base = cardBaseFilename(card);
        rows.push([
            card.id,
            card.certNumber || '',
            card.source || '',
            card.confirmed ? 'true' : 'false',
            ...META_FIELDS.map(f => card.metadata[f.key] || ''),
            `${base}_front.jpg`,
            `${base}_back.jpg`
        ]);
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
