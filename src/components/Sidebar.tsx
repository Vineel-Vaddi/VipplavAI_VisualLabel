import React from "react";
import { LabelClass, CLASS_COLORS, BoundingBox, ImageDoc, User } from "../types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Database, 
  Trash2, 
  Download, 
  FolderOpen,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  RefreshCw
} from "lucide-react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentImage: ImageDoc | null;
  currentIndex: number;
  totalImages: number;
  boxes: BoundingBox[];
  currentClass: LabelClass;
  onClassChange: (cls: LabelClass) => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onSaveLocal: () => void;
  onSaveDB: () => void;
  onMarkDone: () => void;
  onSkip: () => void;
  onDeleteBox: (id: string) => void;
  onClearAll: () => void;
  onLoadFolder: () => void;
  onLoadDB: () => void;
  onBulkImport: () => void;
  source: "local" | "db";
  saveStatus: "idle" | "saving" | "saved" | "error";
  filter: "all" | "labeled" | "skipped" | "unlabeled";
  onFilterChange: (filter: "all" | "labeled" | "skipped" | "unlabeled") => void;
  isDatasetLoaded: boolean;
  currentUser: User | null;
  onSwitchUser: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentImage,
  currentIndex,
  totalImages,
  boxes,
  currentClass,
  onClassChange,
  onPrev,
  onNext,
  onJump,
  onSaveLocal,
  onSaveDB,
  onMarkDone,
  onSkip,
  onDeleteBox,
  onClearAll,
  onLoadFolder,
  onLoadDB,
  onBulkImport,
  source,
  saveStatus,
  filter,
  onFilterChange,
  isDatasetLoaded,
  currentUser,
  onSwitchUser
}) => {
  const classCounts = boxes.reduce((acc, box) => {
    acc[box.class] = (acc[box.class] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const isDone = currentImage?.status === "completed";

  return (
    <div className="w-80 h-full bg-neutral-900 border-l border-neutral-800 flex flex-col text-neutral-200">
      {/* Navigation */}
      {isDatasetLoaded && (
        <div className="p-4 border-b border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Filter</span>
            <select 
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as any)}
              className="bg-neutral-800 text-[10px] rounded px-2 py-1 border-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All</option>
              <option value="labeled">Labeled</option>
              <option value="skipped">Skipped</option>
              <option value="unlabeled">Unlabeled</option>
            </select>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Navigation</span>
            <span className="text-xs text-neutral-400">
              {totalImages > 0 ? `${currentIndex + 1} / ${totalImages}` : "0 / 0"}
            </span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="flex-1 flex items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={onNext}
              disabled={currentIndex === totalImages - 1}
              className="flex-1 flex items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="mt-3">
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300" 
                style={{ width: totalImages > 0 ? `${((currentIndex + 1) / totalImages) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Label Selection */}
      {isDatasetLoaded && (
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-4">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider block mb-2">Select Class</span>
            <div className="space-y-2">
              {Object.values(LabelClass).map((cls) => (
                <button
                  key={cls}
                  onClick={() => onClassChange(cls)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all border",
                    currentClass === cls 
                      ? "bg-neutral-800 border-neutral-600 text-white shadow-lg" 
                      : "bg-transparent border-transparent text-neutral-400 hover:bg-neutral-800/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CLASS_COLORS[cls] }} />
                    <span className="capitalize">{cls.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-300">
                    {classCounts[cls] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Box List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Annotations ({boxes.length})</span>
              {boxes.length > 0 && (
                <button 
                  onClick={onClearAll}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {boxes.map((box, idx) => (
                <div 
                  key={box.id}
                  className="group flex items-center justify-between p-2 bg-neutral-800/30 hover:bg-neutral-800 rounded text-[11px] border border-transparent hover:border-neutral-700 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[box.class] }} />
                    <span className="text-neutral-300">Box #{idx + 1}</span>
                    <span className="text-neutral-500 italic">({Math.round(box.width)}x{Math.round(box.height)})</span>
                  </div>
                  <button 
                    onClick={() => onDeleteBox(box.id)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {boxes.length === 0 && (
                <div className="text-center py-4 text-neutral-600 text-xs italic">
                  No boxes drawn yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      {isDatasetLoaded && (
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {saveStatus === "saved" && <CheckCircle2 size={14} className="text-emerald-500" />}
              {saveStatus === "error" && <AlertCircle size={14} className="text-red-500" />}
              <span className={cn(
                "text-[10px] font-medium uppercase tracking-tighter",
                saveStatus === "saved" ? "text-emerald-500" : 
                saveStatus === "error" ? "text-red-500" : "text-neutral-500"
              )}>
                {saveStatus === "idle" ? "Unsaved Changes" : 
                 saveStatus === "saving" ? "Saving..." : 
                 saveStatus === "saved" ? "All Changes Saved" : "Save Error"}
              </span>
            </div>
            {isDone && (
               <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20">
                 DONE
               </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onSaveLocal}
              disabled={!isDone}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
            >
              <Download size={16} />
              YOLO
            </button>
            <button 
              onClick={onSkip}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-yellow-500 rounded-lg text-sm font-medium transition-all"
            >
              <AlertCircle size={16} />
              Skip
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onSaveDB}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition-all"
            >
              <Save size={16} />
              Save DB
            </button>
            <button 
              onClick={onMarkDone}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
            >
              <CheckCircle2 size={18} />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
