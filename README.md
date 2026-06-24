# SRO — Screen Recording OCR

SRO (Screen Recording OCR) is a highly efficient, single-screen full-stack utility designed for a very specific and essential task: **automatically extracting, chronologically ordering, and deduplicating visual text from screen recordings.** 

Whether you are capturing software tutorials, online presentations, slide decks, or web-based discoveries, SRO processes your video file (up to 25MB) using the state-of-the-art **Gemini 3.5 Flash** model. It eliminates duplicate frames, transcribes complete paragraphs, sidebars, code snippets, and callouts, and segments them with precise location labels (e.g., `[Slide 8 - Sidebar]`) and clickable timestamps.

---

## 🚀 Core Features

- **Intellectual Layout Parsing**: Instead of just extracting titles, SRO captures full paragraphs, detailed list items, sidebars, block quotes, and callout matrices underneath headings.
- **Accurate Screen Locations**: Automatically tags transcribed text snippets with contextual labels like `[Slide 8 - Callouts 1 to 7]`, `[How It Works Slide - Main Section]`, or `[Settings Panel]`.
- **Zero Visual Noise**: Suppresses all scene, animation, or physical environment descriptions. SRO returns only the literal, verbatim text visible on screen.
- **Smart Filtering & Bulk Actions**: 
  - Real-time search highlighting of text results.
  - **Copy Filtered Results**: Instantly copy only the currently filtered segments matching your search query.
  - **Copy Full Transcript**: Copy everything with a single click.
- **Export Formats**: Ready-to-go quick exports to plain `.txt` files or structured `.json` formats.
- **Sleek Minimalist Aesthetic**: Beautifully crafted interface using soft whites, charcoal tones, and subtle sunset/sunrise orange accents. Includes native OS screen-recording shortcut guides.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React (v18+), Vite, Tailwind CSS, Lucide Icons, and Motion for sleek, responsive micro-animations.
- **Backend**: Express server integrated with Vite middleware for optimal dev/prod routing.
- **A.I. Engine**: `@google/genai` TypeScript SDK utilizing the fast and multimodal **Gemini 3.5 Flash** model.
- **Constraints**: Enforces a strict 25 MB file upload limit to comply with server proxy requirements and maximize prompt efficiency.

---

## 📦 Getting Started

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed.

### 2. Set Up Environment Variables
Create a `.env` file in the root directory (using `.env.example` as a template) and add your Google Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Installation & Run
Install the project dependencies and launch SRO in development mode:
```bash
# Install package dependencies
npm install

# Run the unified Express + Vite dev server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access SRO.

---

## 🚢 Production Build & Deployment

To bundle SRO into a production-ready package:
```bash
# Build the React SPA assets and compile the server entry point using esbuild
npm run build

# Start the optimized Node production server
npm run start
```

This compiles a clean, standalone, unified bundle inside the `dist/` directory that runs out of `dist/server.cjs` on port 3000.

---

## 🌟 Visual Guidelines

- **Primary Colors**: Neutral whites, deep charcoal text, and minimal slate gray backgrounds.
- **Accents**: Subtle sunset/sunrise orange hover-states on buttons, lists, and highlight borders.
- **Typography**: Paired system sans-serif headers with clean monospace indicators for timestamps.
