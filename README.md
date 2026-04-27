# Slab Scanner

A lightweight web app for batch processing graded card photos. Upload front and back images of graded cards, detect card outlines automatically, and export paired images.

## Features

- **Drag-and-drop interface** — Upload front and back card photos easily
- **Object detection** — AI-powered card boundary detection using TensorFlow.js
- **Adjustable buffer** — Fine-tune the crop area with pixel-based padding
- **Batch processing** — Process multiple cards by uploading new pairs
- **One-click export** — Download cropped front/back images as JPEGs

## How to Use

1. Open `index.html` in a web browser (or deploy to Netlify/Vercel for live access)
2. Drag and drop (or select) the front photo of your graded card
3. Drag and drop (or select) the back photo
4. The app automatically detects the card outline and displays it on both images
5. Adjust the buffer (padding) if needed for either side
6. Enter a card name/ID (e.g., "PSA-001", "Base-Charizard")
7. Click "Export Front & Back" to download both cropped images
8. Repeat with the next pair of photos

## Technical Details

- **Framework:** Plain HTML/CSS/JavaScript (no build step required)
- **Object Detection:** TensorFlow.js + COCO-SSD model (runs in browser)
- **Deployment:** Static site — works on Netlify, Vercel, GitHub Pages, or GCS
- **No Backend:** All processing happens client-side; no server required

## Development

No installation needed — just serve the files:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js http-server
npx http-server
```

Then open http://localhost:8000

## Customization

### Adjust Default Buffer

Edit `app.js`, find the line `value="10"` in the HTML, or change in-app via the UI.

### Use a Different Detection Model

The app currently uses COCO-SSD for general object detection. For better card-specific detection, you could:
- Train a custom YOLO model on graded cards
- Switch to a different TensorFlow.js model (PoseNet, BlazeFace, etc.)
- Implement edge detection for more precise card boundaries

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Files

- `index.html` — Main interface
- `app.js` — Application logic and TensorFlow.js integration
- `styles.css` — Bootstrap 5 + custom styling

## Related Repos

Part of the FutureGadgetCollections ecosystem:
- `collection-showcase-frontend` — Public collection showcase
- `collection-admin` — Catalog management UI
