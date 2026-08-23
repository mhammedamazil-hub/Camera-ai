# JARVIS AI | Advanced Computer Vision System

A fully client-side, single-file "Jarvis-style" interactive web application featuring real-time object detection, computer vision, and AI-powered voice responses — running entirely in the browser with no server-side backend.

## 🎯 Features

### Sci-Fi HUD Interface
- **Cyberpunk/Jarvis-inspired design** with deep dark backgrounds (#030712, #0b1329)
- Glowing neon cyan (#00f0ff) and electric orange (#ff6b35) accent colors
- Animated scanning lines, crosshair reticles, and HUD grid overlays
- Pulsating "Jarvis Core" visualizer ring indicating AI activity
- Corner frame decorations with subtle glow effects

### Webcam Integration
- Uses `navigator.mediaDevices.getUserMedia` for camera access
- Hidden video element feeding into high-performance canvas wrapper
- Proper object scaling and canvas coordinate remapping for accurate bounding box alignment
- Responsive design supporting mobile, tablet, and desktop screens

### Live Computer Vision
- **TensorFlow.js COCO-SSD** for real-time object detection
- Continuous `requestAnimationFrame` render loop at configurable FPS (default: 15)
- Detects 90+ common object classes (people, phones, laptops, cups, etc.)
- Dynamic vector bounding boxes with class labels and confidence percentages
- Non-max suppression for clean, non-overlapping detections
- High confidence detections get enhanced corner bracket visualizations

### Jarvis Voice Interface
- **Web Speech API** integration with British English voice selection
- Cooldown throttling engine (12-second minimum between vocal responses)
- Intelligent quip dictionary with contextual responses for:
  - People: "Welcome back, sir. Systems are nominal."
  - Cell phones: "Accessing encrypted cellular datalinks."
  - Laptops: "Mainframe link established. Compiling local files."
  - And many more contextual object-specific responses
- Generic fallback quips for unrecognized objects
- Session greeting system for initialization

### LLM Extension Template
- Fully commented asynchronous `fetch()` structure for LLM integration
- Supports OpenAI, Anthropic, and custom endpoints
- Demonstrates how to send object labels for generative analysis
- Disabled by default — works flawlessly out of the box

## 🚀 Quick Start

### Local Usage
```bash
# Simply open in your browser
open index.html

# Or use a local server (optional)
python3 -m http.server 8000
# Then visit http://localhost:8000
```

### GitHub Pages Deployment
```bash
# Push to your repository
git add index.html README.md
git commit -m "Add Jarvis AI Computer Vision System"
git push origin main
```

Then enable GitHub Pages in your repository settings (Settings → Pages → Source: main branch).

## 🎮 Controls

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume detection |
| `A` | Toggle audio (Jarvis voice) |
| `Ctrl+R` / `Cmd+R` | Reboot system |

Or use the on-screen control buttons.

## 📋 Browser Requirements

- **Modern browser** with ES6+ support (Chrome, Firefox, Edge, Safari)
- **Camera permissions** — must allow webcam access when prompted
- **Internet connection** — required to load TensorFlow.js models from CDN
- **Web Speech API** support for voice features (enabled by default in most browsers)

## 🔧 Configuration

Edit the `CONFIG` object in the JavaScript section to customize:

```javascript
const CONFIG = {
    SPEECH_COOLDOWN: 12000,    // Milliseconds between quips
    CONFIDENCE_THRESHOLD: 0.45, // Minimum detection confidence
    TARGET_FPS: 15,            // Detection frames per second
    MAX_DETECTIONS: 10         // Max objects to display
};
```

## 🎨 Customization

The CSS variables at the top of the `<style>` section allow easy theming:

```css
:root {
    --bg-primary: #030712;
    --neon-cyan: #00f0ff;
    --electric-orange: #ff6b35;
    /* ... */
}
```

## 🔒 Privacy & Security

- **100% client-side** — no data leaves your browser
- No external API calls by default
- Camera data processed locally in memory
- LLM integration is disabled and clearly marked for optional use

## ⚠️ Error Handling

The application gracefully handles:
- Camera permission denials
- No camera hardware detected
- Camera in use by another application
- Model loading failures
- Speech synthesis unavailability

Beautiful sci-fi styled error cards guide users through resolution steps.

## 📄 Technical Stack

- **HTML5** — Semantic structure with canvas and video elements
- **CSS3** — Custom properties, animations, responsive design
- **Vanilla ES6+ JavaScript** — No framework dependencies
- **TensorFlow.js** — Machine learning in the browser
- **COCO-SSD** — Pre-trained object detection model
- **Web Speech API** — Native browser voice synthesis

## 📝 License

This project is open source. Feel free to modify and deploy as needed.

---

*“All systems operational. Ready for command, sir.” — JARVIS*
