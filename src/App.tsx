import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AnnotationCanvas from "./components/AnnotationCanvas";
import Sidebar from "./components/Sidebar";
import Previewer from "./components/Previewer";
import PreviewSidebar from "./components/PreviewSidebar";
import Layout from "./components/Layout";
import { LabelClass, BoundingBox, ImageDoc, AnnotationDoc, User } from "./types";
import SourceSelection from "./components/SourceSelection";
import { generateYOLOZip, ExportImage } from "./utils/yolo";
import { pixelToNormalized, normalizedToPixel } from "./utils/yoloParser";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, UploadCloud, Database, Eye, PenTool, User as UserIcon, Plus, Check, AlertCircle, Bell } from "lucide-react";

export default function App() {
  const [view, setView] = useState<"home" | "labeler" | "previewer">("home");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [dbError, setDbError] = useState<string | null>(null);
  const [mitigation, setMitigation] = useState<string[] | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [images, setImages] = useState<ImageDoc[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [currentClass, setCurrentClass] = useState<LabelClass>(LabelClass.HELMET);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<"local" | "db" | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, labeled: 0 });
  const [filter, setFilter] = useState<"all" | "labeled" | "skipped" | "unlabeled">("all");
  const [showDebug, setShowDebug] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: "success" | "info" | "warning" }[]>([]);
  
  // Track if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return saveStatus === "idle" && boxes.length > 0;
  }, [saveStatus, boxes]);

  // Prevent data loss and release assignments on navigation/reload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Release assignments on unload if session is active
      if (source === "db" && sessionId && currentUser) {
        const payload = JSON.stringify({ session_id: sessionId, user_id: currentUser._id });
        navigator.sendBeacon("/api/work/release", new Blob([payload], { type: 'application/json' }));
      }

      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved annotations. If you leave this page, your work will be lost. Continue?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, source, sessionId, currentUser]);

  // Heartbeat interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (source === "db" && sessionId && currentUser) {
      interval = setInterval(() => {
        fetch("/api/work/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, user_id: currentUser._id })
        }).catch(err => console.error("Heartbeat failed", err));
      }, 5 * 60 * 1000); // 5 minutes
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [source, sessionId, currentUser]);

  const addNotification = (message: string, type: "success" | "info" | "warning" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };
  
  // Previewer State Sync
  const [previewState, setPreviewState] = useState<{
    images: ImageDoc[];
    currentIndex: number;
    stats: any;
    isDatasetLoaded: boolean;
    onSwitchDataset: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered images
  const filteredImages = useMemo(() => {
    let result = [...images];
    
    // Status Filter
    switch (filter) {
      case "labeled": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "labeled" 
            : img.status === "completed"
        ); 
        break;
      case "skipped": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.is_skipped 
            : img.status === "skipped"
        ); 
        break;
      case "unlabeled": 
        result = result.filter(img => 
          source === "db" 
            ? img.workItem?.annotation_status === "unlabeled" && !img.workItem?.is_skipped
            : img.status === "unlabeled"
        ); 
        break;
    }

    return result;
  }, [images, filter, source]);

  // Reset index when filter changes to avoid out of bounds or inconsistent state
  useEffect(() => {
    setCurrentIndex(0);
  }, [filter]);

  // Ensure currentIndex is always valid for filteredImages
  useEffect(() => {
    if (currentIndex >= filteredImages.length && filteredImages.length > 0) {
      setCurrentIndex(filteredImages.length - 1);
    }
  }, [filteredImages.length, currentIndex]);

  const currentImage = filteredImages[currentIndex] || null;

  // Fetch users on mount
  useEffect(() => {
    checkDbStatus();
  }, []);

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

  const checkDbStatus = async () => {
    const { ok, data, error } = await safeFetch("/api/health");
    if (ok && data.db) {
      setDbStatus("connected");
      setDbError(null);
      setMitigation(null);
      fetchUsers();
    } else {
      setDbStatus("disconnected");
      setDbError(error || data?.error || "Database not connected");
      setMitigation(data?.mitigation);
      loadLocalUsers();
    }
  };

  const handleRetryDb = async () => {
    setDbStatus("connecting");
    const { ok, data, error } = await safeFetch("/api/db/retry", { method: "POST" });
    if (ok && (data.status === "connected" || data.status === "already_connected")) {
      setDbStatus("connected");
      setDbError(null);
      setMitigation(null);
      fetchUsers();
    } else {
      setDbStatus("disconnected");
      setDbError(error || data?.error || "Failed to connect");
      const health = await safeFetch("/api/health");
      setMitigation(health.data?.mitigation);
      loadLocalUsers();
    }
  };

  const loadLocalUsers = () => {
    const saved = localStorage.getItem("labeler_users");
    if (saved) {
      try {
        setUsers(JSON.parse(saved));
      } catch (e) {
        setUsers([]);
      }
    }
    setIsLocalMode(true);
  };

  const fetchUsers = async () => {
    const { ok, data } = await safeFetch("/api/users");
    if (ok && Array.isArray(data)) {
      setUsers(data);
    } else {
      console.error("Failed to fetch users or data is not an array", data);
      setDbStatus("disconnected");
      loadLocalUsers();
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    if (isLocalMode || dbStatus === "disconnected") {
      const newUser: User = {
        _id: `local-user-${Date.now()}`,
        name: newUserName,
        created_at: new Date().toISOString(),
        total_annotations: 0
      };
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      localStorage.setItem("labeler_users", JSON.stringify(updatedUsers));
      setCurrentUser(newUser);
      setShowUserModal(false);
      setNewUserName("");
      setIsLocalMode(true);
      return;
    }

    const { ok, data, error } = await safeFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newUserName })
    });

    if (ok && data && !data.error) {
      setUsers(prev => Array.isArray(prev) ? [...prev, data] : [data]);
      setCurrentUser(data);
      setShowUserModal(false);
      setNewUserName("");
    } else {
      const errorMsg = error || (data?.details ? `${data.error}: ${data.details}` : (data?.error || "Failed to create user"));
      alert(errorMsg + "\n\nSwitching to Local Mode...");
      setDbStatus("disconnected");
      setIsLocalMode(true);
      loadLocalUsers();
    }
  };

  // Sync boxes when current image changes
  useEffect(() => {
    if (currentImage) {
      if (source === "db") {
        handleAssignImage(currentImage);
        fetchAnnotations(currentImage.image_id);
      } else {
        setBoxes(currentImage.annotations || []);
      }
      setSaveStatus("idle");
    }
  }, [currentImage, source]);

  const handleAssignImage = async (image: ImageDoc) => {
    // Deprecated: Assignment now happens via /api/work/assign in batch
    return;
  };

  // Update image annotations in memory
  const updateImageAnnotations = useCallback((newBoxes: BoundingBox[]) => {
    setBoxes(newBoxes);
    if (currentImage && source === "local") {
      setImages(prev => prev.map(img => 
        img.image_id === currentImage.image_id 
          ? { ...img, annotations: newBoxes, status: newBoxes.length > 0 ? "in_progress" : "unlabeled" } 
          : img
      ));
    }
  }, [currentImage, source]);

  const handleImageLoad = useCallback((w: number, h: number) => {
    setImageSize({ width: w, height: h });
    if (currentImage && source === "local" && (!currentImage.width || !currentImage.height)) {
      setImages(prev => prev.map(img => 
        img.image_id === currentImage.image_id ? { ...img, width: w, height: h } : img
      ));
    }
  }, [currentImage, source]);

  const fetchAnnotations = async (imageId: string) => {
    if (!imageId) return;
    if (isLocalMode || dbStatus === "disconnected") {
      const saved = localStorage.getItem(`labeler_ann_${imageId}`);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          setBoxes(data.boxes || []);
        } catch (e) {
          setBoxes([]);
        }
      } else {
        setBoxes([]);
      }
      setSaveStatus("idle");
      return;
    }

    const { ok, data } = await safeFetch(`/api/annotations/${encodeURIComponent(imageId)}`);
    if (ok && data) {
      // Convert normalized boxes back to pixel boxes
      if (data.boxes && data.boxes.length > 0) {
        const pixelBoxes = data.boxes.map((box: any) => normalizedToPixel(box, imageSize.width || 100, imageSize.height || 100));
        setBoxes(pixelBoxes);
      } else {
        setBoxes([]);
      }
    }
    setSaveStatus("idle");
  };

  const handleSaveDB = async (markAsDone = false) => {
    if (!currentImage || !currentUser) return;
    
    if (isLocalMode || dbStatus === "disconnected") {
      setSaveStatus("saving");
      try {
        const data = {
          image_id: currentImage.image_id,
          user_id: currentUser._id,
          boxes: boxes, // In local mode we store pixel boxes directly for simplicity
          updated_at: new Date()
        };
        localStorage.setItem(`labeler_ann_${currentImage.image_id}`, JSON.stringify(data));
        
        if (markAsDone) {
          setImages(prev => prev.map(img => 
            img.image_id === currentImage.image_id ? { ...img, status: "completed" } : img
          ));
          addNotification("Annotations saved locally", "success");
        }
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
      }
      return;
    }

    if (source !== "db") return;
    
    setSaveStatus("saving");
    // Convert pixel boxes to normalized structured format
    const normalizedBoxes = boxes.map(box => pixelToNormalized(box, imageSize.width, imageSize.height));

    const { ok, data, status } = await safeFetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_id: currentImage.image_id,
        user_id: currentUser._id,
        session_id: sessionId,
        boxes: normalizedBoxes,
        status: markAsDone ? "labeled" : "in_progress"
      })
    });
    
    if (ok) {
      setSaveStatus("saved");
      if (markAsDone) {
        setImages(prev => prev.map(img => 
          img.image_id === currentImage.image_id 
            ? { 
                ...img, 
                status: "completed",
                workItem: img.workItem ? { ...img.workItem, annotation_status: "labeled", save_status: "db_saved", is_uploaded_to_db: true } : img.workItem
              } 
            : img
        ));
        addNotification("Annotations successfully uploaded to MongoDB", "success");
      } else {
        setImages(prev => prev.map(img => 
          img.image_id === currentImage.image_id 
            ? { 
                ...img, 
                workItem: img.workItem ? { ...img.workItem, annotation_status: "in_progress", save_status: "db_saved", is_uploaded_to_db: true } : img.workItem
              } 
            : img
        ));
        addNotification("Annotations saved to DB", "info");
      }
    } else {
      setSaveStatus("error");
      console.error("Save failed:", data?.error);
      addNotification(`Save failed: ${data?.error}`, "warning");
    }
  };

  const handleSaveLocal = async () => {
    // 1. Filter images that are labeled or have annotations
    const candidateImages = images.filter(img => 
      (img.annotations && img.annotations.length > 0) || img.status === "completed"
    );

    if (candidateImages.length === 0) {
      alert("No labeled images to export!");
      return;
    }

    // 2. Validation & Confirmation
    const exportImages: ExportImage[] = [];
    
    for (const img of candidateImages) {
      const hasBoxes = img.annotations && img.annotations.length > 0;
      
      if (!hasBoxes) {
        // Requirement 4: Confirmation for image without boxes
        if (window.confirm(`Image "${img.filename}" has no annotations. Exclude from export?`)) {
           continue; 
        }
        // If they said "No" (Cancel), they want to include it? 
        // But requirement 3 says: "Only export images that have at least one valid bounding box."
        // We will skip it anyway to satisfy Requirement 3.
        continue;
      }
      
      // Fetch image data if missing (for DB source)
      let imageData: Blob | string | undefined = img.file || img.dataUrl;
      
      if (!imageData && source === "db") {
        try {
          const res = await fetch(`/api/images/${img.image_id}/data`);
          imageData = await res.blob();
        } catch (e) {
          console.error(`Failed to fetch image data for ${img.filename}`, e);
          continue;
        }
      }

      if (!imageData) {
        console.error(`No image data found for ${img.filename}`);
        continue;
      }

      exportImages.push({
        filename: img.filename,
        boxes: img.annotations || [],
        width: img.width || imageSize.width,
        height: img.height || imageSize.height,
        data: imageData
      });
    }

    if (exportImages.length === 0) {
      alert("No images with annotations to export!");
      return;
    }

    setSaveStatus("saving");
    try {
      const blob = await generateYOLOZip(exportImages);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yolo_dataset.zip";
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Export failed", err);
      setSaveStatus("error");
      alert("Export failed. See console for details.");
    } finally {
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleSkip = async () => {
    if (!currentImage || !currentUser || !sessionId) return;
    
    if (source === "db") {
      const { ok, data } = await safeFetch("/api/work/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_id: currentImage.image_id,
          user_id: currentUser._id,
          session_id: sessionId
        })
      });

      if (ok) {
        setImages(prev => prev.map(img => 
          img.image_id === currentImage.image_id 
            ? { ...img, status: "skipped", workItem: img.workItem ? { ...img.workItem, is_skipped: true } : img.workItem } 
            : img
        ));
        addNotification("Image marked as skipped in DB", "info");
        handleNext();
      } else {
        addNotification(`Failed to skip: ${data?.error}`, "warning");
      }
    } else {
      setImages(prev => prev.map(img => 
        img.image_id === currentImage.image_id ? { ...img, status: "skipped" } : img
      ));
      addNotification("Image marked as skipped", "info");
      handleNext();
    }
  };

  const handleLoadFolder = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    
    if (imageFiles.length === 0) return;

    const newImages: ImageDoc[] = imageFiles.map((file, idx) => ({
      _id: `local-${idx}-${Date.now()}`,
      image_id: `local-${idx}-${Date.now()}`,
      filename: file.name,
      status: "unlabeled",
      source: "local",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dataUrl: URL.createObjectURL(file),
      file: file,
      width: 0,
      height: 0,
      annotations: []
    }));

    setImages(newImages);
    setCurrentIndex(0);
    setSource("local");
    setBoxes([]);
    setFilter("all");
    setView("labeler");
    addNotification(`${newImages.length} local images loaded`, "success");
  };

  const handleLoadDB = async () => {
    console.log("[Labeler] Connect DB clicked");
    if (!currentUser) {
      console.log("[Labeler] No user selected, showing modal");
      setShowUserModal(true);
      return;
    }
    setIsLoading(true);
    setSource("db");
    console.log(`[Labeler] Requesting batch assignment for user: ${currentUser.name}`);
    try {
      // Call batch assignment endpoint
      const { ok, data } = await safeFetch("/api/work/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser._id, limit: 100 })
      });
      
      console.log("[Labeler] Received response from assignment", ok);
      
      if (!ok) {
        throw new Error(data?.error || `Failed to assign images`);
      }
      
      setSessionId(data.session_id);
      console.log(`[Labeler] Assigned ${data.images.length} images in session ${data.session_id}`);
      
      if (data.images.length === 0) {
        alert("No unlabeled images available for assignment in MongoDB.");
      } else {
        addNotification(`${data.images.length} images assigned to your session`, "success");
      }
      
      setImages(data.images);
      setCurrentIndex(0);
      setFilter("all");
      setView("labeler");
      
      const stats = await safeFetch("/api/stats");
      if (stats.ok) setStats(stats.data);
    } catch (err: any) {
      console.error("[Labeler] Failed to load from DB", err);
      alert(`Failed to connect to MongoDB: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkImportToDB = async () => {
    if (images.length === 0 || source !== "local") return;
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      for (const img of images) {
        const res = await fetch(img.dataUrl!);
        const blob = await res.blob();
        formData.append("files", blob, img.filename);
      }
      
      const res = await fetch("/api/images/upload", {
        method: "POST",
        body: formData
      });
      
      if (res.ok) {
        alert("Bulk import successful!");
        handleLoadDB();
      } else {
        alert("Bulk import failed.");
      }
    } catch (err) {
      console.error("Bulk import error", err);
      alert("Error during bulk import.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < filteredImages.length - 1) {
      if (source === "db" && saveStatus === "idle" && boxes.length > 0) {
        handleSaveDB();
      }
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleDeleteBox = (id: string) => {
    const newBoxes = boxes.filter(b => b.id !== id);
    updateImageAnnotations(newBoxes);
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all annotations for this image?")) {
      updateImageAnnotations([]);
    }
  };

  const handleMarkDone = async () => {
    if (boxes.length === 0) {
      if (!window.confirm("No boxes drawn. Mark as done anyway?")) return;
    }
    
    if (source === "local") {
      setImages(prev => prev.map(img => 
        img.image_id === currentImage?.image_id ? { ...img, status: "completed" } : img
      ));
      addNotification("Session saved locally.", "success");
      handleNext();
    } else {
      if (!sessionId || !currentUser) return;
      
      setIsLoading(true);
      try {
        // 1. Save current image if needed
        if (hasUnsavedChanges) {
          await handleSaveDB(true);
        }

        // 2. Mark session as done
        const { ok, data } = await safeFetch("/api/work/done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, user_id: currentUser._id })
        });

        if (ok) {
          addNotification("Session completed and images released", "success");
          // Update images status locally
          setImages(prev => prev.map(img => ({
            ...img,
            status: img.workItem?.annotation_status === "labeled" ? "completed" : img.status,
            workItem: img.workItem ? { ...img.workItem, assignment_status: "completed", is_done_clicked: true } : img.workItem
          })));
        } else {
          addNotification(`Failed to complete session: ${data?.error}`, "warning");
        }
      } catch (err) {
        console.error("Mark done error:", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedBoxId) handleDeleteBox(selectedBoxId);
      }
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveDB();
      }
      if (e.key === "d") setShowDebug(prev => !prev);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBoxId, boxes, currentIndex, filteredImages, images]);

  const isDatasetLoaded = view === "labeler" ? images.length > 0 : (previewState?.isDatasetLoaded || false);

  return (
    <Layout 
      view={view} 
      setView={(v) => {
        if (hasUnsavedChanges && v === "home") {
          if (!window.confirm("You have unsaved annotations. If you leave this page, your work will be lost. Continue?")) {
            return;
          }
        }
        setView(v);
      }}
      isDatasetLoaded={isDatasetLoaded}
      currentUser={currentUser}
      source={source}
      onSwitchUser={() => setShowUserModal(true)}
      sidebar={
        view === "home" ? null :
        view === "labeler" ? (
          <Sidebar
            currentImage={currentImage}
            currentIndex={currentIndex}
            totalImages={filteredImages.length}
            boxes={boxes}
            currentClass={currentClass}
            onClassChange={setCurrentClass}
            onPrev={handlePrev}
            onNext={handleNext}
            onJump={setCurrentIndex}
            onSaveLocal={handleSaveLocal}
            onSaveDB={() => handleSaveDB()}
            onMarkDone={handleMarkDone}
            onSkip={handleSkip}
            onDeleteBox={handleDeleteBox}
            onClearAll={handleClearAll}
            onLoadFolder={handleLoadFolder}
            onLoadDB={handleLoadDB}
            onBulkImport={handleBulkImportToDB}
            source={source || "local"}
            saveStatus={saveStatus}
            filter={filter}
            onFilterChange={setFilter}
            isDatasetLoaded={images.length > 0}
            currentUser={currentUser}
            onSwitchUser={() => setShowUserModal(true)}
          />
        ) : (
          previewState && previewState.isDatasetLoaded ? (
            <PreviewSidebar 
              images={previewState.images}
              currentIndex={previewState.currentIndex}
              stats={previewState.stats}
              onSwitchDataset={previewState.onSwitchDataset}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
              <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-600">
                <Database size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">No Dataset</p>
                <p className="text-[10px] text-neutral-600 italic">Load a dataset to see insights and statistics.</p>
              </div>
            </div>
          )
        )
      }
    >
      {/* Notifications */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md ${
                n.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                n.type === "warning" ? "bg-red-500/10 border-red-500/20 text-red-500" :
                "bg-blue-500/10 border-blue-500/20 text-blue-500"
              }`}
            >
              <Bell size={16} />
              <span className="text-xs font-bold tracking-tight">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showUserModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    dbStatus === "connected" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    <UserIcon size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white">Select Profile</h2>
                      <div className="flex items-center gap-2">
                        {dbStatus === "disconnected" && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryDb();
                            }}
                            className="text-[8px] font-bold uppercase tracking-wider text-neutral-500 hover:text-white transition-colors"
                          >
                            Retry Cloud
                          </button>
                        )}
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border ${
                          dbStatus === "connected" 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                            : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                        }`}>
                          <div className={`w-1 h-1 rounded-full ${dbStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {dbStatus === "connected" ? "Cloud Sync" : "Local Mode"}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {dbStatus === "connected" 
                        ? "Choose your workspace to begin labeling." 
                        : "MongoDB unavailable. Using local storage for profiles."}
                    </p>
                  </div>
                </div>

                {dbStatus === "disconnected" && dbError && (
                  <div className="mb-6 p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-red-500">
                        <AlertCircle size={14} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-medium text-red-400 mb-2">Connection Error:</p>
                        <p className="text-[10px] text-neutral-400 font-mono bg-black/20 p-2 rounded border border-white/5 mb-3 break-all">
                          {dbError}
                        </p>
                        
                        {mitigation && mitigation.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Mitigation Steps:</p>
                            <ul className="space-y-1">
                              {mitigation.map((step, i) => (
                                <li key={i} className="text-[10px] text-neutral-500 flex items-start gap-2">
                                  <span className="text-red-500/50">•</span>
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {Array.isArray(users) && users.map(user => (
                    <button
                      key={user._id}
                      onClick={() => {
                        setCurrentUser(user);
                        setShowUserModal(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
                        currentUser?._id === user._id 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
                          : "bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          currentUser?._id === user._id ? "bg-emerald-500 text-white" : "bg-neutral-700 text-neutral-400"
                        }`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                      {currentUser?._id === user._id && <Check size={18} />}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center text-neutral-500">
                    <Plus size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Create new profile..."
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateUser()}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                  <button 
                    onClick={handleCreateUser}
                    className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    CREATE
                  </button>
                </div>
              </div>
              
              <div className="bg-neutral-950/50 p-4 border-t border-neutral-800 flex justify-center">
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">Vipplav AI VisionLabel Pro v2.5</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === "home" ? (
        <SourceSelection 
          onLoadFolder={handleLoadFolder}
          onLoadDB={handleLoadDB}
          isLoading={isLoading}
          dbStatus={dbStatus}
          dbError={dbError}
          onRetryDb={handleRetryDb}
          currentUser={currentUser}
          onSwitchUser={() => setShowUserModal(true)}
        />
      ) : view === "previewer" ? (
        <Previewer 
          onBack={() => setView("home")} 
          onStateChange={setPreviewState}
        />
      ) : (
        <>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            multiple 
            className="hidden" 
            accept="image/*"
          />
          
          {isLoading && (
            <div className="absolute inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 size={48} className="text-emerald-500 animate-spin mb-4" />
              <p className="text-neutral-400 font-medium tracking-widest uppercase text-xs text-center px-4">Synchronizing with MongoDB...</p>
            </div>
          )}

          <div className="flex-1 relative">
            {currentImage ? (
              <AnnotationCanvas
                imageUrl={source === "local" ? currentImage.dataUrl! : `/api/images/${currentImage.image_id}/data`}
                imageId={currentImage?.image_id}
                source={source}
                boxes={boxes}
                selectedBoxId={selectedBoxId}
                currentClass={currentClass}
                onBoxChange={updateImageAnnotations}
                onSelectBox={setSelectedBoxId}
                onImageLoad={handleImageLoad}
                showDebug={showDebug}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-6">
                <div className="relative">
                  <div className="absolute -inset-4 bg-emerald-500/10 rounded-full blur-2xl animate-pulse" />
                  <UploadCloud size={80} className="relative text-neutral-800" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-neutral-400 mb-2">Ready to Label</h2>
                  <p className="text-sm max-w-xs mx-auto">Upload a local folder or connect to your MongoDB instance to begin annotating.</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={handleLoadFolder}
                    className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-all flex items-center gap-2"
                  >
                    <UploadCloud size={18} />
                    Load Folder
                  </button>
                  <button 
                    onClick={handleLoadDB}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                  >
                    <Database size={18} />
                    Connect DB
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          {currentImage && (
            <div className="h-10 bg-neutral-900 border-t border-neutral-800 flex items-center px-4 justify-between text-[10px] text-neutral-500 font-mono">
              <div className="flex gap-4">
                <span>FILE: {currentImage.filename}</span>
                <span>DIM: {imageSize.width}x{imageSize.height}</span>
                <span>SOURCE: {source.toUpperCase()}</span>
                <span>STATUS: {currentImage.status.toUpperCase()}</span>
              </div>
              <div className="flex gap-4">
                <span>SHORTCUTS: [DEL] Delete Box | [ARROWS] Navigate | [D] Toggle Debug</span>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
