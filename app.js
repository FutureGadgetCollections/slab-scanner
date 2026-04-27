// State
let frontImageData = null;
let backImageData = null;
let model = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupDropZones();
    setupFileInputs();

    // Load COCO-SSD model
    try {
        showStatus('Loading object detection model...', 'info');
        model = await cocoSsd.load();
        showStatus('Model loaded successfully!', 'success');
    } catch (error) {
        console.error('Error loading model:', error);
        showStatus('Failed to load detection model. Please refresh the page.', 'error');
    }
});

function setupDropZones() {
    ['front', 'back'].forEach(side => {
        const zone = document.getElementById(`${side}DropZone`);

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

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
            if (side === 'front') {
                frontImageData = { file, image: img, canvas: null };
            } else {
                backImageData = { file, image: img, canvas: null };
            }

            displayPreview(side, img);
            processImage(side, img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    showStatus(`${side.charAt(0).toUpperCase() + side.slice(1)} image loaded`, 'success');
}

function displayPreview(side, img) {
    document.getElementById(`${side}Preview`).style.display = 'block';
    document.getElementById(`${side}Image`).src = img.src;
}

async function processImage(side, img) {
    if (!model) {
        showStatus('Detection model not ready', 'error');
        return;
    }

    try {
        // Detect objects in the image
        const predictions = await model.detect(img);

        if (!predictions || predictions.length === 0) {
            showStatus(`No objects detected in ${side} image. Using full image as fallback.`, 'info');
            drawCardOutline(side, {
                x: 0,
                y: 0,
                width: img.width,
                height: img.height
            });
            return;
        }

        // Find the largest detection (should be the card)
        let largestDetection = predictions[0];
        let largestArea = largestDetection.bbox[2] * largestDetection.bbox[3];

        for (const pred of predictions) {
            const area = pred.bbox[2] * pred.bbox[3];
            if (area > largestArea) {
                largestDetection = pred;
                largestArea = area;
            }
        }

        const bbox = largestDetection.bbox;
        drawCardOutline(side, {
            x: bbox[0],
            y: bbox[1],
            width: bbox[2],
            height: bbox[3]
        });

        showStatus(`${side.charAt(0).toUpperCase() + side.slice(1)} card detected`, 'success');
    } catch (error) {
        console.error(`Error processing ${side} image:`, error);
        showStatus(`Error processing ${side} image`, 'error');
    }

    // Show processing section if both images are loaded
    if (frontImageData && backImageData) {
        document.getElementById('processingSection').style.display = 'block';
        document.getElementById('exportSection').style.display = 'block';
    }
}

function drawCardOutline(side, bbox) {
    const imageData = side === 'front' ? frontImageData : backImageData;
    const canvas = document.getElementById(`${side}Canvas`);
    const ctx = canvas.getContext('2d');

    // Set canvas size to match image
    canvas.width = imageData.image.width;
    canvas.height = imageData.image.height;

    // Draw the image
    ctx.drawImage(imageData.image, 0, 0);

    // Get buffer value
    const buffer = parseInt(document.getElementById(`${side}Buffer`).value) || 0;

    // Draw the card outline with buffer
    const x = Math.max(0, bbox.x - buffer);
    const y = Math.max(0, bbox.y - buffer);
    const w = Math.min(canvas.width - x, bbox.width + 2 * buffer);
    const h = Math.min(canvas.height - y, bbox.height + 2 * buffer);

    // Draw rectangle outline
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    // Draw corner markers
    const cornerSize = 20;
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x, y, cornerSize, 3);
    ctx.fillRect(x, y, 3, cornerSize);
    ctx.fillRect(x + w - cornerSize, y, cornerSize, 3);
    ctx.fillRect(x + w - 3, y, 3, cornerSize);
    ctx.fillRect(x, y + h - 3, cornerSize, 3);
    ctx.fillRect(x, y + h - cornerSize, 3, cornerSize);
    ctx.fillRect(x + w - cornerSize, y + h - 3, cornerSize, 3);
    ctx.fillRect(x + w - 3, y + h - cornerSize, 3, cornerSize);

    // Store the bounding box for export
    imageData.boundingBox = { x, y, w, h };
}

function reprocessImages() {
    if (frontImageData && frontImageData.boundingBox) {
        drawCardOutline('front', {
            x: frontImageData.boundingBox.x,
            y: frontImageData.boundingBox.y,
            width: frontImageData.boundingBox.w,
            height: frontImageData.boundingBox.h
        });
    }
    if (backImageData && backImageData.boundingBox) {
        drawCardOutline('back', {
            x: backImageData.boundingBox.x,
            y: backImageData.boundingBox.y,
            width: backImageData.boundingBox.w,
            height: backImageData.boundingBox.h
        });
    }
}

function clearImage(side) {
    const imageData = side === 'front' ? frontImageData : backImageData;
    if (side === 'front') {
        frontImageData = null;
        document.getElementById('frontInput').value = '';
    } else {
        backImageData = null;
        document.getElementById('backInput').value = '';
    }

    document.getElementById(`${side}Preview`).style.display = 'none';
    document.getElementById(`${side}Canvas`).getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    // Hide sections if either image is missing
    if (!frontImageData || !backImageData) {
        document.getElementById('processingSection').style.display = 'none';
        document.getElementById('exportSection').style.display = 'none';
    }
}

async function exportImages() {
    const name = document.getElementById('exportName').value.trim();
    if (!name) {
        showStatus('Please enter a card name/ID', 'error');
        return;
    }

    if (!frontImageData || !frontImageData.boundingBox || !backImageData || !backImageData.boundingBox) {
        showStatus('Images not ready for export', 'error');
        return;
    }

    try {
        showStatus('Exporting images...', 'info');

        // Export front
        const frontCropped = cropImage(frontImageData, 'front');
        downloadImage(frontCropped, `${name}_front.jpg`);

        // Export back
        const backCropped = cropImage(backImageData, 'back');
        downloadImage(backCropped, `${name}_back.jpg`);

        showStatus(`Exported: ${name}_front.jpg and ${name}_back.jpg`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showStatus('Error exporting images', 'error');
    }
}

function cropImage(imageData, side) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const bbox = imageData.boundingBox;

    canvas.width = bbox.w;
    canvas.height = bbox.h;

    ctx.drawImage(
        imageData.image,
        bbox.x,
        bbox.y,
        bbox.w,
        bbox.h,
        0,
        0,
        bbox.w,
        bbox.h
    );

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

function showStatus(message, type = 'info') {
    const alert = document.getElementById('statusAlert');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    alert.style.display = 'block';

    if (type !== 'error') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 4000);
    }
}
