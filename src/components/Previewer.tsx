import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  FolderOpen, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  FileJson,
  LayoutGrid,
  Search,
  ArrowLeft,
  Loader2,
  UploadCloud
} from "lucide-react";
import { LabelClass, CLASS_COLORS, BoundingBox, ImageDoc } from "../types";
import { parseYoloLine, yoloToPixel, REVERSE_CLASS_MAPPING, normalizedToPixel } from "../utils/yoloParser";
import { motion, AnimatePresence } from "motion/react";

interface PreviewerProps {
  onBack: () => void;
  onStateChange?: (state: { 
    images: ImageDoc[]; 
    currentIndex: number; 
    stats: any;
    isDatasetLoaded: boolean;
    onSwitchDataset: () => void;
  }) => void;
}

export default function Previewer({ onBack, onStateChange }: PreviewerProps) {
  const [images, setImages] = useState<ImageDoc[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "labeled" | "missing" | "invalid">("all");
  const [classFilter, setClassFilter] = useState<LabelClass | "all">("all");
  const [userFilter, setUserFilter] = useState<string | "all" | "unlabeled" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"local" | "db" | null>(null);
  const [users, setUsers] = useState<{_id: string, name: string}[]>([]);

  const currentImage = images[currentIndex] || null;

  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        return { ok: res.ok, data, status: res.status };
      } else {
        const text = await res.text();
        console.error(`Expected JSON but received ${contentType || 'unknown'}. Body:`, text.substring(0, 200));
        return { ok: false, error: "Server returned non-JSON response", status: res.status };
      }
    } catch (err: any) {
      console.error(`Fetch error for ${url}:`, err);
      return { ok: false, error: err.message, status: 0 };
    }
  };

  // Fetch users for filtering if in DB mode
  useEffect(() => {
    if (source === "db") {
      safeFetch("/api/users").then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setUsers(data);
      });
    }
  }, [source]);

  const handleLocalFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    console.log(`[Previewer] Selected ${files.length} files`);
    setIsLoading(true);
    setError(null);

    const imageFiles: File[] = [];
    const labelFiles: { [name: string]: File } = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = (file as any).webkitRelativePath || file.name;

      if (path.match(/\.(jpg|jpeg|png|webp)$/i)) imageFiles.push(file);
      if (path.endsWith(".txt")) {
        const name = path.split("/").pop()?.replace(".txt", "");
        if (name) labelFiles[name] = file;
      }
    }

    console.log(`[Previewer] Found ${imageFiles.length} images and ${Object.keys(labelFiles).length} labels`);

    if (imageFiles.length === 0) {
      setError("No images found in the selected folder.");
      setIsLoading(false);
      return;
    }

    try {
      const processedImages: ImageDoc[] = [];
      for (const imgFile of imageFiles) {
        const stem = imgFile.name.replace(/\.[^/.]+$/, "");
        const labelFile = labelFiles[stem];
        
        let annotations: BoundingBox[] = [];
        let status: ImageDoc["status"] = "unlabeled";
        let hasInvalid = false;

        if (labelFile) {
          const text = await labelFile.text();
          const lines = text.split("\n").filter(l => l.trim());
          
          const dimensions = await new Promise<{w: number, h: number}>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const w = img.width;
              const h = img.height;
              URL.revokeObjectURL(img.src);
              resolve({ w, h });
            };
            img.onerror = () => resolve({ w: 100, h: 100 });
            img.src = URL.createObjectURL(imgFile);
          });

          annotations = lines.map(line => {
            const parsed = parseYoloLine(line);
            if (!parsed.isValid) hasInvalid = true;
            return yoloToPixel(parsed, dimensions.w, dimensions.h, REVERSE_CLASS_MAPPING);
          }).filter(Boolean) as BoundingBox[];

          status = hasInvalid ? "skipped" : "completed";
          
          processedImages.push({
            _id: `preview-${Math.random()}`,
            image_id: stem,
            filename: imgFile.name,
            status,
            source: "local",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dataUrl: URL.createObjectURL(imgFile),
            annotations,
            width: dimensions.w,
            height: dimensions.h
          });
        } else {
          processedImages.push({
            _id: `preview-${Math.random()}`,
            image_id: stem,
            filename: imgFile.name,
            status: "unlabeled",
            source: "local",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dataUrl: URL.createObjectURL(imgFile),
            annotations: [],
            width: 0,
            height: 0
          });
        }
      }

      console.log(`[Previewer] Processed ${processedImages.length} images`);
      setImages(processedImages);
      setSource("local");
      setCurrentIndex(0);
    } catch (err) {
      console.error("[Previewer] Folder processing error:", err);
      setError("Failed to process folder. Ensure it follows YOLO structure.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectDB = async () => {
    console.log("[Previewer] Connect DB clicked");
    setIsLoading(true);
    setError(null);
    console.log("[Previewer] Fetching images from MongoDB");
    try {
      const { ok, data, status } = await safeFetch("/api/images?limit=1000");
      console.log("[Previewer] Received response from backend", ok);
      
      if (!ok) throw new Error(`Server responded with ${status}`);
      
      const imagesData = data;
      console.log(`[Previewer] Received ${imagesData.length} image metadata docs`);
      
      if (imagesData.length === 0) {
        setError("No images found in MongoDB.");
        setIsLoading(false);
        return;
      }
      
      const processed = await Promise.all(imagesData.map(async (img: any) => {
        try {
          const { ok: annOk, data: annData } = await safeFetch(`/api/annotations/${encodeURIComponent(img.image_id)}`);
          
          let annotations: BoundingBox[] = [];
          if (annOk && annData && annData.boxes && annData.boxes.length > 0) {
            // Use image dimensions from the image doc
            annotations = annData.boxes.map((box: any) => 
              normalizedToPixel(box, img.width || 100, img.height || 100)
            );
          }

          return {
            ...img,
            annotations
          };
        } catch (e) {
          return { ...img, annotations: [] };
        }
      }));

      console.log(`[Previewer] Processed ${processed.length} images with annotations`);
      setImages(processed);
      setSource("db");
      setCurrentIndex(0);
      console.log("[Previewer] UI state updated successfully");
    } catch (err: any) {
      console.error("[Previewer] Failed to load dataset from MongoDB", err);
      setError(`Failed to load dataset from MongoDB: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredImages = useMemo(() => {
    let result = [...images];

    // 1. Status Filter
    switch (filter) {
      case "labeled": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "labeled" 
            : img.status === "completed"
        ); 
        break;
      case "missing": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "unlabeled" && !img.workItem?.is_skipped
            : img.status === "unlabeled"
        ); 
        break;
      case "invalid": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.is_skipped 
            : img.status === "skipped"
        ); 
        break;
    }

    // 2. Class Filter
    if (classFilter !== "all") {
      result = result.filter(img => 
        img.annotations?.some(box => box.class === classFilter)
      );
    }

    // 3. User Filter
    if (userFilter !== "all") {
      if (userFilter === "unlabeled") {
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "unlabeled" 
            : img.status === "unlabeled"
        );
      } else if (userFilter === "completed") {
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "labeled" 
            : img.status === "completed"
        );
      } else {
        // Specific user ID
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.user_id === userFilter 
            : true // In local mode, we don't track user assignment per image doc
        );
      }
    }

    // 4. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      if (source === "db") {
        // Search by image_id in DB mode
        result = result.filter(img => img.image_id.toLowerCase().includes(query));
      } else {
        // Search by filename in Local mode
        result = result.filter(img => img.filename.toLowerCase().includes(query));
      }
    }

    return result;
  }, [images, filter, classFilter, userFilter, searchQuery, source]);

  // Reset index when filters change
  useEffect(() => {
    setCurrentIndex(0);
  }, [filter, classFilter, userFilter, searchQuery]);

  const stats = useMemo(() => {
    const classDist: Record<string, number> = {};
    let invalidCount = 0;
    let labeledCount = 0;
    let missingCount = 0;
    
    images.forEach(img => {
      img.annotations?.forEach(box => {
        classDist[box.class] = (classDist[box.class] || 0) + 1;
      });

      if (source === "db") {
        if (img.workItem?.is_skipped) invalidCount++;
        else if (img.workItem?.annotation_status === "labeled") labeledCount++;
        else missingCount++;
      } else {
        if (img.status === "skipped") invalidCount++;
        else if (img.status === "completed") labeledCount++;
        else missingCount++;
      }
    });

    return {
      total: images.length,
      labeled: labeledCount,
      missingLabels: missingCount,
      invalidLines: invalidCount,
      classDistribution: classDist
    };
  }, [images, source]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        images,
        currentIndex,
        stats,
        isDatasetLoaded: images.length > 0,
        onSwitchDataset: () => {
          setImages([]);
          setSource(null);
          setCurrentIndex(0);
        }
      });
    }
  }, [images, currentIndex, stats, onStateChange]);

  if (images.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-6 relative">
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 size={48} className="text-emerald-500 animate-spin mb-4" />
            <p className="text-neutral-400 font-medium tracking-widest uppercase text-xs">Loading Dataset...</p>
          </div>
        )}
        
        <div className="relative">
          <div className="absolute -inset-4 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
          <Search size={80} className="relative text-neutral-800" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-neutral-400 mb-2">Ready to Preview</h2>
          <p className="text-sm max-w-xs mx-auto text-neutral-500">Select a local folder or connect to MongoDB to review your dataset.</p>
        </div>
        <div className="flex gap-4">
          <label className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-all flex items-center gap-2 cursor-pointer">
            <FolderOpen size={18} />
            Load Folder
            <input 
              type="file" 
              className="hidden" 
              {...({ webkitdirectory: "", directory: "" } as any)}
              onChange={handleLocalFolderSelect} 
            />
          </label>
          <button 
            onClick={handleConnectDB}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <Database size={18} />
            Connect DB
          </button>
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Advanced Filtering & Search Bar */}
      <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder={source === "db" ? "Search image_id..." : "Search filename..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Status</span>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-neutral-800 text-[10px] rounded px-2 py-1.5 border border-neutral-700 text-neutral-300 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="labeled">Completed</option>
              <option value="missing">Unlabeled</option>
              <option value="invalid">Skipped</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Class</span>
            <select 
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as any)}
              className="bg-neutral-800 text-[10px] rounded px-2 py-1.5 border border-neutral-700 text-neutral-300 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Classes</option>
              {Object.values(LabelClass).map(cls => (
                <option key={cls} value={cls}>{cls.replace(/_/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">User</span>
            <select 
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value as any)}
              className="bg-neutral-800 text-[10px] rounded px-2 py-1.5 border border-neutral-700 text-neutral-300 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Users</option>
              <option value="unlabeled">Unlabeled</option>
              <option value="completed">Completed</option>
              {users.map(user => (
                <option key={user._id} value={user._id}>{user.name}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => {
              setFilter("all");
              setClassFilter("all");
              setUserFilter("all");
              setSearchQuery("");
            }}
            className="text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-wider transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-8 bg-neutral-900/50">
        {currentImage ? (
          <div className="relative max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden border border-neutral-800 bg-black">
            <img 
              src={currentImage.dataUrl || `/api/images/${currentImage.image_id}/data`} 
              alt={currentImage.filename}
              className="max-w-full max-h-[75vh] object-contain block"
            />
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${currentImage.width || 100} ${currentImage.height || 100}`}
              preserveAspectRatio="none"
            >
              {currentImage.annotations?.map((box) => (
                <g key={box.id}>
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    fill="transparent"
                    stroke={CLASS_COLORS[box.class]}
                    strokeWidth="2"
                  />
                  <rect 
                    x={box.x}
                    y={box.y - 15}
                    width={box.class.length * 7 + 10}
                    height="15"
                    fill={CLASS_COLORS[box.class]}
                  />
                  <text
                    x={box.x + 4}
                    y={box.y - 4}
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {box.class}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-600">
              <Search size={32} />
            </div>
            <div className="text-center">
              <p className="text-neutral-400 font-bold uppercase tracking-widest text-xs">No Matches Found</p>
              <p className="text-neutral-600 text-[10px] mt-1">Try adjusting your filters or search query.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-center gap-4">
        <button 
          onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-xl">
          <input 
            type="number" 
            value={currentIndex + 1}
            onChange={(e) => {
              const val = parseInt(e.target.value) - 1;
              if (!isNaN(val) && val >= 0 && val < filteredImages.length) setCurrentIndex(val);
            }}
            className="w-12 bg-transparent text-center font-bold text-white focus:outline-none"
          />
          <span className="text-neutral-500">/</span>
          <span className="text-neutral-500 font-medium">{filteredImages.length}</span>
        </div>

        <button 
          onClick={() => setCurrentIndex(prev => Math.min(filteredImages.length - 1, prev + 1))}
          disabled={currentIndex === filteredImages.length - 1}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-lg transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Status Bar */}
      {currentImage && (
        <div className="h-10 bg-neutral-900 border-t border-neutral-800 flex items-center px-4 justify-between text-[10px] text-neutral-500 font-mono">
          <div className="flex gap-4">
            <span>FILE: {currentImage.filename}</span>
            <span>SOURCE: {source?.toUpperCase()}</span>
            <span>STATUS: {currentImage.status.toUpperCase()}</span>
          </div>
          <div className="flex gap-4">
            <span>PREVIEW MODE</span>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
