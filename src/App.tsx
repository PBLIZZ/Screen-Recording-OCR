import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  Search, 
  Copy, 
  Check, 
  FileText, 
  Trash2, 
  Edit2, 
  Save, 
  Download, 
  Film, 
  Clock, 
  History, 
  Sparkles, 
  AlertCircle, 
  X, 
  RefreshCw,
  FileDown,
  Wallpaper
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// TypeScript Interfaces for application state
interface TranscriptSegment {
  text: string;
  timestamp: string;
}

interface RecordingEntry {
  id: string;
  filename: string;
  title: string;
  uploadedAt: string;
  segments: TranscriptSegment[];
}

export default function App() {
  // State variables
  const [history, setHistory] = useState<RecordingEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [dragActive, setDragActive] = useState(false);
  
  // Upload and transcription state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedFiltered, setCopiedFiltered] = useState(false);
  const [copiedSegmentIndex, setCopiedSegmentIndex] = useState<number | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("screen_transcripts_history");
      if (stored) {
        const parsed: RecordingEntry[] = JSON.parse(stored);
        setHistory(parsed);
        if (parsed.length > 0) {
          setSelectedId(parsed[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load history from localStorage", e);
    }
  }, []);

  // Save history to localStorage whenever it changes
  const saveToLocalStorage = (newHistory: RecordingEntry[]) => {
    try {
      localStorage.setItem("screen_transcripts_history", JSON.stringify(newHistory));
    } catch (e) {
      console.error("Failed to save history to localStorage", e);
    }
  };

  // Get active recording
  const activeRecording = history.find(entry => entry.id === selectedId) || null;

  // Handle Drag Events for file upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop Event
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Handle manual file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Trigger file selection input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Handle the file upload and request to server
  const handleFile = async (file: File) => {
    // Validate file type
    const fileExt = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["mp4", "mov", "webm", "mkv", "avi", "quicktime"];
    
    if (!validExtensions.includes(fileExt || "") && !file.type.startsWith("video/")) {
      setErrorMessage(
        `Unsupported file type (.${fileExt || "unknown"}). Please upload a valid screen-recording video (e.g. .mp4, .mov, .webm).`
      );
      return;
    }

    // Validate file size (max 25MB to comply with proxy/ingress limits)
    const MAX_SIZE_MB = 25;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage(
        `The selected file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). To ensure a successful upload and comply with server limits, please compress your video or use a shorter clip under ${MAX_SIZE_MB} MB.`
      );
      return;
    }

    // Prepare upload state
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingStatus("Preparing video file upload...");
    setSelectedId(null);

    const formData = new FormData();
    formData.append("video", file);

    try {
      setProcessingStatus("Uploading video to server (this can take a few moments)...");
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      let responseBodyText = "";
      try {
        responseBodyText = await response.text();
      } catch (readErr) {
        console.error("Failed to read response body as text:", readErr);
      }

      if (!response.ok) {
        let errorMessageText = "Server failed to transcribe the video.";
        if (response.status === 413) {
          errorMessageText = "The selected video file is too large for the upload proxy (HTTP 413 Payload Too Large). Please upload a smaller video clip or a compressed version of the file under 25 MB.";
        } else if (responseBodyText.trim()) {
          try {
            const errorData = JSON.parse(responseBodyText);
            errorMessageText = errorData.error || errorMessageText;
          } catch (parseError) {
            errorMessageText = responseBodyText;
          }
        } else {
          errorMessageText = `Server error (${response.status}): ${response.statusText || "Unknown error"}`;
        }

        if (errorMessageText.trim().startsWith("<!DOCTYPE html>") || errorMessageText.trim().startsWith("<html")) {
          errorMessageText = `The server returned an HTML error response (HTTP ${response.status}). This can happen if the video file size exceeded server processing limits or the backend server is reloading. Please check your file size and try again.`;
        }
        throw new Error(errorMessageText);
      }

      setProcessingStatus("Transcription complete! Parsing results...");
      let data;
      try {
        data = JSON.parse(responseBodyText);
      } catch (jsonErr) {
        console.error("[JSON Parse Error] Raw response:", responseBodyText);
        let sample = responseBodyText.trim();
        if (sample.length > 150) {
          sample = sample.substring(0, 150) + "...";
        }
        throw new Error(`Failed to parse response as JSON. Server returned (starts with): "${sample}"`);
      }

      // Create new history entry
      const newEntry: RecordingEntry = {
        id: Date.now().toString(),
        filename: file.name,
        title: file.name.replace(/\.[^/.]+$/, ""), // strip extension for editable title
        uploadedAt: new Date().toLocaleDateString(undefined, { 
          month: "short", 
          day: "numeric", 
          hour: "2-digit", 
          minute: "2-digit" 
        }),
        segments: data.segments || []
      };

      const updatedHistory = [newEntry, ...history];
      setHistory(updatedHistory);
      setSelectedId(newEntry.id);
      saveToLocalStorage(updatedHistory);
      setIsProcessing(false);
      setProcessingStatus("");

    } catch (error: any) {
      console.error("Error transcribing:", error);
      setErrorMessage(error.message || "An unexpected network error occurred. Please check your file size and try again.");
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  // Edit Title
  const startEditingTitle = () => {
    if (!activeRecording) return;
    setEditTitleValue(activeRecording.title);
    setIsEditingTitle(true);
  };

  const saveTitle = () => {
    if (!activeRecording || !editTitleValue.trim()) return;
    const updatedHistory = history.map(entry => {
      if (entry.id === activeRecording.id) {
        return { ...entry, title: editTitleValue.trim() };
      }
      return entry;
    });
    setHistory(updatedHistory);
    saveToLocalStorage(updatedHistory);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveTitle();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  };

  // Delete Recording Entry
  const deleteRecording = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting
    if (confirm("Are you sure you want to delete this transcription from your local history?")) {
      const updatedHistory = history.filter(entry => entry.id !== id);
      setHistory(updatedHistory);
      saveToLocalStorage(updatedHistory);
      
      if (selectedId === id) {
        setSelectedId(updatedHistory.length > 0 ? updatedHistory[0].id : null);
        setIsEditingTitle(false);
      }
    }
  };

  // Copy Full Transcript
  const copyFullTranscript = () => {
    if (!activeRecording) return;
    
    const textToCopy = activeRecording.segments
      .map(seg => `[${seg.timestamp}] ${seg.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2000);
      })
      .catch(err => {
        console.error("Failed to copy transcript: ", err);
      });
  };

  // Copy Filtered Transcript (matches current search results)
  const copyFilteredTranscript = () => {
    if (!activeRecording || filteredSegments.length === 0) return;
    
    const textToCopy = filteredSegments
      .map(seg => `[${seg.timestamp}] ${seg.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopiedFiltered(true);
        setTimeout(() => setCopiedFiltered(false), 2000);
      })
      .catch(err => {
        console.error("Failed to copy filtered transcript: ", err);
      });
  };

  // Copy Single Segment
  const copySegment = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedSegmentIndex(index);
        setTimeout(() => setCopiedSegmentIndex(null), 1500);
      })
      .catch(err => {
        console.error("Failed to copy segment: ", err);
      });
  };

  // Export as TXT file
  const exportAsTxt = () => {
    if (!activeRecording) return;

    const content = `Screen Recording Transcript: ${activeRecording.title}\n` +
      `Uploaded: ${activeRecording.uploadedAt}\n` +
      `Original Filename: ${activeRecording.filename}\n` +
      `==================================================\n\n` +
      activeRecording.segments
        .map(seg => `[${seg.timestamp}]\n${seg.text}`)
        .join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeRecording.title}_transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export as JSON file
  const exportAsJson = () => {
    if (!activeRecording) return;

    const content = JSON.stringify(activeRecording, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeRecording.title}_transcript.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Text highlighting logic for Search
  const highlightText = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    
    const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`(${escapedQuery})`, "gi");
    
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="bg-amber-100 text-amber-950 px-1 rounded font-medium border-b border-amber-200">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Filter segments based on query
  const filteredSegments = activeRecording
    ? activeRecording.segments.filter(seg => 
        seg.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="flex h-screen w-full bg-white text-slate-900 overflow-hidden font-sans">
      
      {/* Hidden input for trigger */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="video/*"
        onChange={handleFileChange}
        disabled={isProcessing}
      />

      {/* Left Sidebar: Logo, Project History, Upload CTA */}
      <aside className="w-80 border-r border-slate-100 bg-slate-50/50 flex flex-col shrink-0">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-sm relative">
              <Wallpaper className="w-5 h-5 text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full border border-white"></span>
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 leading-tight">SRO</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Screen Recording OCR</p>
            </div>
          </div>
        </div>

        {/* Sidebar History Entries */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="px-2 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recordings</p>
          
          {history.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl bg-white/50">
              <History className="w-5 h-5 text-slate-300 mx-auto mb-2" />
              <p className="text-[11px] font-medium text-slate-400">No recordings processed</p>
              <p className="text-[9px] text-slate-400 mt-0.5">Your list will appear here once uploaded</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {history.map((entry) => {
                const isActive = entry.id === selectedId;
                return (
                  <div
                    key={entry.id}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setIsEditingTitle(false);
                      setSearchQuery("");
                    }}
                    className={`group p-3 rounded-xl cursor-pointer border transition-all duration-200 relative flex flex-col justify-between ${
                      isActive 
                        ? "bg-white border-slate-200 text-slate-900 shadow-sm ring-1 ring-orange-500/10" 
                        : "hover:bg-slate-100/70 border-transparent text-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 pr-6">
                      <div className={`text-xs font-semibold truncate leading-tight ${isActive ? "text-slate-900 font-bold" : ""}`}>
                        {entry.title}
                      </div>
                      <button
                        onClick={(e) => deleteRecording(entry.id, e)}
                        className={`p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all absolute right-2.5 top-2.5 ${
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                        title="Delete recording"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2.5">
                      <div className={`text-[10px] font-mono shrink-0 ${isActive ? "text-orange-600 font-semibold" : "text-slate-400"}`}>
                        {entry.segments.length} Screens Extracted
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {entry.uploadedAt}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        {/* Sidebar Bottom CTA Upload Panel */}
        <div className="p-6 bg-white border-t border-slate-100">
          <button 
            onClick={() => {
              setSelectedId(null);
              setErrorMessage(null);
              triggerFileInput();
            }}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-orange-600 disabled:bg-slate-300 text-white py-3 px-4 rounded-xl text-sm font-semibold active:scale-98 transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            New Upload
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        
        {/* Top Header / Search bar */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
          <div className="flex flex-col min-w-0 mr-4">
            {activeRecording ? (
              <>
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 max-w-xl">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onKeyDown={handleTitleKeyDown}
                      className="text-lg font-bold bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-950 w-full"
                      autoFocus
                    />
                    <button 
                      onClick={saveTitle} 
                      className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shrink-0 transition-colors"
                      title="Save Title"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setIsEditingTitle(false)} 
                      className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 shrink-0 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group max-w-md">
                    <h2 className="text-lg font-bold text-slate-900 truncate tracking-tight">{activeRecording.title}</h2>
                    <button 
                      onClick={startEditingTitle}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-50 rounded-md text-slate-400 hover:text-slate-700"
                      title="Edit title"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest leading-none mt-0.5">
                  De-duplicated Transcript
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900">Screen Recording Text Extractor</h2>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest leading-none mt-0.5">
                  OCR Video Transcripts
                </p>
              </>
            )}
          </div>

          {/* Header Action Tools */}
          {activeRecording && (
            <div className="flex items-center gap-4 shrink-0">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input 
                  type="text" 
                  placeholder="Search transcript..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs w-64 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:bg-white transition-all duration-200"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Export Dropdown Shortcut */}
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <button
                  onClick={exportAsTxt}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50/50 hover:text-orange-600 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200/50 hover:border-orange-200/50 shadow-sm flex items-center gap-1 transition-all group/btn"
                  title="Export to Plain Text"
                >
                  <Download className="w-3 h-3 text-slate-400 group-hover/btn:text-orange-500 transition-colors" />
                  <span>.TXT</span>
                </button>
                <button
                  onClick={exportAsJson}
                  className="px-2.5 py-1.5 bg-white hover:bg-orange-50/50 hover:text-orange-600 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200/50 hover:border-orange-200/50 shadow-sm flex items-center gap-1 transition-all group/btn"
                  title="Export raw JSON"
                >
                  <FileText className="w-3 h-3 text-slate-400 group-hover/btn:text-orange-500 transition-colors" />
                  <span>.JSON</span>
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Section: Main Workspace Canvas - Seamless integration */}
        <section className="flex-1 overflow-hidden flex flex-col bg-white">
          
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {activeRecording ? (
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                
                {/* Scrollable Transcript Lists */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
                  {filteredSegments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <Search className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-400">No matching segments found</p>
                      <p className="text-xs text-slate-400 mt-1">Try clearing your search query or entering other keywords.</p>
                    </div>
                  ) : (
                    <div className="space-y-8 max-w-4xl mx-auto w-full">
                      {filteredSegments.map((segment, index) => (
                        <div key={index} className="group relative flex gap-6">
                          {/* Time label */}
                          <span className="text-[10px] font-mono text-slate-400 pt-1.5 w-12 text-right shrink-0 flex items-center justify-end gap-1 select-none">
                            <Clock className="w-2.5 h-2.5" />
                            {segment.timestamp}
                          </span>

                          {/* Text Block & Copy Controls */}
                          <div className="flex-1">
                            <div className="text-sm md:text-base leading-relaxed text-slate-800 font-sans whitespace-pre-wrap select-all selection:bg-slate-100">
                              {highlightText(segment.text, searchQuery)}
                            </div>
                            
                            <div className="mt-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-2">
                              <button 
                                onClick={() => copySegment(segment.text, index)}
                                className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
                                  copiedSegmentIndex === index
                                    ? "text-emerald-700 bg-emerald-50 border border-emerald-100"
                                    : "text-slate-700 bg-slate-50 hover:bg-orange-50 hover:text-orange-600 border border-slate-200/50 hover:border-orange-200/50"
                                }`}
                              >
                                {copiedSegmentIndex === index ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Copied segment</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-orange-400 group-hover:text-orange-500" />
                                    <span>Copy segment</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Action Bar */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-6 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                      {activeRecording.segments.length} Phrases Extracted
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
                      Deduplicated & Cleaned
                    </span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[200px] hidden md:inline">
                      Source: {activeRecording.filename}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                    {searchQuery.trim() && (
                      <button 
                        onClick={copyFilteredTranscript}
                        className={`px-5 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                          copiedFiltered 
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm" 
                            : "bg-white border-orange-200 text-orange-950 hover:bg-orange-50/50"
                        }`}
                      >
                        {copiedFiltered ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600 animate-pulse" />
                            <span>Copied Filtered ({filteredSegments.length})!</span>
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            <span>Copy Filtered Results ({filteredSegments.length})</span>
                          </>
                        )}
                      </button>
                    )}

                    <button 
                      onClick={copyFullTranscript}
                      className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                        copiedFull 
                          ? "bg-emerald-600 text-white shadow-sm" 
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {copiedFull ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied All text!</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          <span>Copy All Text</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              // Empty & Upload Workspace Canvas
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className="flex-1 flex flex-col overflow-y-auto bg-white"
              >
                
                {/* Uploader Box Component */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto">
                  
                  {/* Upload Card or Drag target */}
                  <div 
                    onClick={triggerFileInput}
                    className={`border-2 border-dashed rounded-3xl p-10 w-full flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 bg-slate-50/50 ${
                      dragActive
                        ? "border-orange-500 bg-orange-50/20 scale-98 shadow-sm"
                        : "border-slate-200 hover:border-orange-400/80 hover:bg-orange-50/5 hover:shadow-sm"
                    }`}
                  >
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-800 shadow-sm border border-slate-100 mb-6 transition-transform hover:scale-105">
                      {isProcessing ? (
                        <RefreshCw className="w-8 h-8 text-slate-800 animate-spin" />
                      ) : (
                        <Upload className="w-8 h-8 text-slate-600" />
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      Upload your screen recording
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-md mb-6">
                      Drag & drop your presentation slideshow, online video tutorials, or code demo file here. Supported formats: <strong className="text-slate-700">.mp4, .mov, .webm, .mkv</strong> up to 25 MB (approx. 2-3 minutes).
                    </p>

                    <span className="bg-slate-900 hover:bg-orange-600 text-white font-semibold text-xs py-2.5 px-6 rounded-xl transition-all active:scale-95 duration-200">
                      Select Video File
                    </span>
                  </div>

                  {/* Processing / Status bar info */}
                  <AnimatePresence>
                    {isProcessing && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="mt-6 w-full p-5 bg-slate-900 text-white rounded-2xl text-left flex flex-col gap-3 shadow-xl"
                      >
                        <div className="flex items-center gap-3">
                          <RefreshCw className="w-5 h-5 text-slate-300 animate-spin shrink-0" />
                          <span className="text-xs font-bold tracking-tight">Processing & transcribing screen frames...</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-slate-300 leading-normal font-medium">
                            {processingStatus}
                          </p>
                          <div className="w-full bg-slate-800 h-1 mt-1 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-2/3 animate-pulse rounded-full"></div>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal pt-1">
                            We use server-side Gemini 3.5 Flash to automatically detect, transcode, and de-duplicate text appearing on screen. This usually takes 1-2 minutes.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {errorMessage && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="mt-6 w-full p-5 bg-rose-50 border border-rose-100 text-rose-950 rounded-2xl text-left flex items-start gap-3 shadow-sm"
                      >
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="text-xs font-bold">Transcription failed</p>
                            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-[11px] text-rose-800 leading-relaxed mt-1">{errorMessage}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* App info cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 w-full">
                    <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 text-left">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                        A.I. Frame De-duplication
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Identifies when static slideshow slides remain on screen across seconds, preserving chronological context without repeating text blocks.
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 text-left">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <Copy className="w-3.5 h-3.5 text-slate-600" />
                        Copy, Search, and Export
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Quickly search for keywords to find the exact slide timestamp, click any snippet to copy it, or download the full text transcript with one click.
                      </p>
                    </div>
                  </div>

                  {/* Guide Panel: How to record for best OCR results */}
                  <div className="mt-6 border border-slate-100 bg-slate-50/30 rounded-2xl p-5 text-left w-full">
                    <div className="flex items-center gap-2 mb-3">
                      <Film className="w-4 h-4 text-orange-500" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Quick Screen Recording Guide
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600">
                      <div>
                        <p className="font-semibold text-slate-800 mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                          macOS (Built-in)
                        </p>
                        <p className="leading-relaxed text-[11px] text-slate-500 mb-2">
                          Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono shadow-sm text-[10px]">Cmd + Shift + 5</kbd> to open controls. Select a portion of the screen or full display and click Record.
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          💡 Tip: Save directly to a local folder rather than iCloud for quick uploads.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                          Windows (Built-in)
                        </p>
                        <p className="leading-relaxed text-[11px] text-slate-500 mb-2">
                          Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono shadow-sm text-[10px]">Win + Alt + R</kbd> to start/stop recording immediately, or <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono shadow-sm text-[10px]">Win + G</kbd> to open Game Bar.
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          💡 Tip: Keep recordings brief (1–3 mins) and clear of desktop clutter for maximum OCR accuracy.
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}

          </div>

        </section>

      </main>

    </div>
  );
}
