import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

// Ensure the temporary directory exists
const tempDir = "/tmp";
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer setup for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB limit for up to 10-minute high-res recordings
  }
});

// Initialize Gemini client on server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Video transcription endpoint
  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    console.log("[Transcribe] Request received.");

    if (!req.file) {
      console.error("[Transcribe] No file uploaded in request.");
      res.status(400).json({ error: "No video file was uploaded." });
      return;
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;
    console.log(`[Transcribe] Uploaded: ${originalName} (${mimeType}), path: ${filePath}`);

    let uploadResult: any = null;

    try {
      console.log("[Transcribe] Uploading file to Gemini File API...");
      uploadResult = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: mimeType
        }
      });
      console.log(`[Transcribe] File uploaded to Gemini successfully: ${uploadResult.name}, URI: ${uploadResult.uri}`);

      // Poll file processing state until active
      console.log("[Transcribe] Waiting for Gemini to process the video...");
      let fileState = await ai.files.get({ name: uploadResult.name });
      let attempts = 0;
      const maxAttempts = 120; // 6 minutes maximum polling for large files

      while (fileState.state === "PROCESSING" && attempts < maxAttempts) {
        attempts++;
        console.log(`[Transcribe] Polling attempt ${attempts}: State is ${fileState.state}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        fileState = await ai.files.get({ name: uploadResult.name });
      }

      if (fileState.state !== "ACTIVE") {
        throw new Error(`Gemini File processing timed out or failed with state: ${fileState.state}`);
      }
      console.log("[Transcribe] File is ACTIVE on Gemini. Initiating transcription model call...");

      // Call Gemini 3.5 Flash to transcribe text from the screen-recording video
      const prompt = `This is a screen recording of a presentation/slideshow or a computer screen. 
Your goal is to build a highly accurate, copyable, and searchable transcript of all the visual text with duplicate frames removed.

Follow these strict transcription instructions:
1. Capture ALL visible text: Do not just scan for headings. You must transcribe all the filled-in text, paragraphs, descriptions, callouts, cards, sidebars, footer notes, and lists under those headings. Every piece of visible text should be captured.
2. ABSOLUTELY NO SCENE DESCRIPTIONS: Do not describe actions, animations, or what is happening visually in the video (e.g., do NOT write "A person is clicking a button" or "Diagram showing workflow"). Transcribe ONLY the literal text shown on screen.
3. IDENTIFY SCREEN LOCATIONS: For each text block, prepend a clear label identifying where it appears or which slide/component it belongs to, based on the visual context (e.g., "[Slide 8 - Sidebar]", "[Slide 8 - Callouts 1 to 7]", "[How It Works Slide - Main Section]", "[Settings Panel]", or similar identifying location labels). Put this label at the very beginning of the transcribed text.
4. REMOVE DUPLICATES: If the same text block remains visible on screen across consecutive frames or seconds, do not repeat it. Only write each text block once when it first appears or changes.
5. Order the segments chronologically from start to end of the video.
6. Output the result as a JSON array of objects, where each object represents a distinct visible text section with properties:
   - "text": The exact text transcribed from the screen, starting with the location label, e.g. "[Slide 8 - Sidebar]\nDetailed text here..." (preserve original formatting, newlines, and casing).
   - "timestamp": The approximate timestamp in the video when this text appears (e.g. "00:05", "01:23").
7. Return ONLY the valid JSON array of objects.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            fileData: {
              fileUri: uploadResult.uri,
              mimeType: uploadResult.mimeType
            }
          },
          { text: prompt }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: {
                  type: Type.STRING,
                  description: "The exact visible text transcribed from the screen. Duplicates removed."
                },
                timestamp: {
                  type: Type.STRING,
                  description: "The approximate timestamp when this text first appears, e.g. '00:15'."
                }
              },
              required: ["text", "timestamp"]
            }
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response received from transcription model.");
      }

      console.log("[Transcribe] Transcription response received successfully. Parsing content...");
      const transcriptSegments = JSON.parse(responseText);

      console.log(`[Transcribe] Successfully parsed ${transcriptSegments.length} segments.`);
      res.json({
        filename: originalName,
        segments: transcriptSegments
      });

    } catch (error: any) {
      console.error("[Transcribe] Error during transcription process:", error);
      res.status(500).json({
        error: error.message || "An error occurred during screen transcription processing."
      });
    } finally {
      // Clean up the local temporary file
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[Transcribe] Cleaned up local file: ${filePath}`);
        } catch (unlinkErr) {
          console.error(`[Transcribe] Error removing local file ${filePath}:`, unlinkErr);
        }
      }

      // Clean up the file from Gemini File Store
      if (uploadResult && uploadResult.name) {
        try {
          await ai.files.delete({ name: uploadResult.name });
          console.log(`[Transcribe] Cleaned up file from Gemini File API: ${uploadResult.name}`);
        } catch (deleteErr) {
          console.error(`[Transcribe] Error deleting file from Gemini File API:`, deleteErr);
        }
      }
    }
  });

  // Vite integration middleware (handles client serving)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[Server] Vite middleware integrated.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Server] Static production assets served from dist/.");
  }

  // Global JSON error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[Global Error] Caught error:", err);
    res.status(err.status || 500).json({
      error: err.message || "An unexpected server error occurred."
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Express server running on port ${PORT}`);
  });
}

startServer();
