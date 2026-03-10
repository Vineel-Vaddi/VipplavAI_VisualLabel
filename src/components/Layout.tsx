import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { PenTool, Eye, Home, User as UserIcon, Database, FolderOpen } from "lucide-react";

interface LayoutProps {
  view: "home" | "labeler" | "previewer";
  setView: (view: "home" | "labeler" | "previewer") => void;
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  isDatasetLoaded?: boolean;
  currentUser?: { name: string } | null;
  source?: "local" | "db" | null;
  datasetName?: string;
  onSwitchUser?: () => void;
}

export default function Layout({ 
  view, 
  setView, 
  children, 
  sidebar,
  isDatasetLoaded = false,
  currentUser,
  source,
  datasetName = "traffic_violation",
  onSwitchUser
}: LayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-neutral-950 overflow-hidden font-sans text-neutral-200 flex-col">
      {/* Top Navigation */}
      <div className="h-14 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/20">V</div>
            <span className="font-bold text-base tracking-tight hidden sm:inline-block">Vipplav AI VisionLabel Pro</span>
          </div>

          {view !== "home" && (
            <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl">
              <button 
                onClick={() => setView("labeler")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "labeler" ? "bg-neutral-700 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                <PenTool size={14} />
                Labeler
              </button>
              <button 
                onClick={() => setView("previewer")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "previewer" ? "bg-neutral-700 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
              >
                <Eye size={14} />
                Previewer
              </button>
            </div>
          )}
        </div>
        
        {view !== "home" && (
          <div className="flex items-center gap-6 text-[11px] font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg border border-neutral-700/50 group relative">
              <UserIcon size={14} className="text-emerald-500" />
              <span className="text-neutral-500 uppercase tracking-wider font-bold">User:</span>
              <span className="text-white">{currentUser?.name || "Guest"}</span>
              <button 
                onClick={onSwitchUser}
                className="absolute -right-2 -top-2 w-5 h-5 bg-neutral-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-500 text-white shadow-lg"
                title="Switch User"
              >
                <PenTool size={10} />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
              {source === "db" ? <Database size={14} className="text-blue-500" /> : <FolderOpen size={14} className="text-amber-500" />}
              <span className="text-neutral-500 uppercase tracking-wider font-bold">Source:</span>
              <span className="text-white">{source === "db" ? "MongoDB" : "Local Folder"}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
              <span className="text-neutral-500 uppercase tracking-wider font-bold">Dataset:</span>
              <span className="text-white">{datasetName}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {view !== "home" && (
            <button 
              onClick={() => setView("home")}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-neutral-700"
            >
              <Home size={16} />
              Home
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Sidebar Area */}
        {sidebar && (
          <aside className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col shrink-0 overflow-hidden">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
