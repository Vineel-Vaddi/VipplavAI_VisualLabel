import React from "react";
import { 
  FileJson, 
  LayoutGrid, 
  Activity, 
  PieChart, 
  Info, 
  List
} from "lucide-react";
import { LabelClass, CLASS_COLORS, ImageDoc } from "../types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PreviewSidebarProps {
  images: ImageDoc[];
  currentIndex: number;
  stats: {
    total: number;
    labeled: number;
    missingLabels: number;
    invalidLines: number;
    classDistribution: Record<string, number>;
  };
  onSwitchDataset: () => void;
}

export default function PreviewSidebar({ 
  images, 
  currentIndex, 
  stats,
  onSwitchDataset 
}: PreviewSidebarProps) {
  const currentImage = images[currentIndex] || null;

  const handleExportReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      stats,
      images: images.map(img => ({
        filename: img.filename,
        status: img.status,
        boxCount: img.annotations?.length || 0
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dataset_health_report.json";
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200 overflow-hidden">
      <div className="p-4 border-b border-neutral-800">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity size={16} className="text-blue-500" />
          Dataset Insights
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Health Stats */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Health Overview</span>
            <button 
              onClick={handleExportReport}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              <FileJson size={12} />
              Report
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
              <p className="text-[9px] text-neutral-500 uppercase">Labeled</p>
              <p className="text-lg font-bold text-white">{Math.round((stats.labeled / (stats.total || 1)) * 100)}%</p>
            </div>
            <div className="bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
              <p className="text-[9px] text-neutral-500 uppercase">Missing</p>
              <p className="text-lg font-bold text-yellow-500">{stats.missingLabels}</p>
            </div>
            <div className="bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
              <p className="text-[9px] text-neutral-500 uppercase">Invalid</p>
              <p className="text-lg font-bold text-red-500">{stats.invalidLines}</p>
            </div>
            <div className="bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-800">
              <p className="text-[9px] text-neutral-500 uppercase">Total</p>
              <p className="text-lg font-bold text-blue-500">{stats.total}</p>
            </div>
          </div>
        </section>

        {/* Class Distribution */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <PieChart size={14} className="text-neutral-500" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Distribution</span>
          </div>
          <div className="space-y-1.5">
            {Object.values(LabelClass).map(cls => (
              <div key={cls} className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[cls] }} />
                  <span className="text-xs text-neutral-400 capitalize">{cls.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">
                  {stats.classDistribution[cls] || 0}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Current Image Info */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-neutral-500" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Image Info</span>
          </div>
          <div className="bg-neutral-800/30 rounded-lg p-3 space-y-2 border border-neutral-800 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">Status</span>
              <span className={cn(
                "font-bold px-1.5 py-0.5 rounded text-[9px] uppercase",
                currentImage?.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
                currentImage?.status === "skipped" ? "bg-red-500/10 text-red-500" :
                "bg-neutral-700 text-neutral-400"
              )}>
                {currentImage?.status || "Unknown"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Annotations</span>
              <span className="font-bold text-white">{currentImage?.annotations?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Filename</span>
              <span className="text-white truncate max-w-[120px]">{currentImage?.filename}</span>
            </div>
          </div>
        </section>

        {/* Annotation List */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <List size={14} className="text-neutral-500" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Annotations</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {currentImage?.annotations?.map((box, idx) => (
              <div key={box.id} className="flex items-center justify-between p-2 bg-neutral-800/30 rounded border border-transparent hover:border-neutral-700 transition-all">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLASS_COLORS[box.class] }} />
                  <span className="text-[10px] text-neutral-400">Box #{idx + 1}</span>
                </div>
                <span className="text-[9px] font-mono text-neutral-600">
                  {box.class}
                </span>
              </div>
            ))}
            {(!currentImage?.annotations || currentImage.annotations.length === 0) && (
              <p className="text-[10px] text-neutral-600 italic text-center py-2">No annotations</p>
            )}
          </div>
        </section>
      </div>

      <div className="p-4 bg-neutral-950 border-t border-neutral-800">
        <button 
          onClick={onSwitchDataset}
          className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
        >
          <LayoutGrid size={14} />
          Switch Dataset
        </button>
      </div>
    </div>
  );
}
