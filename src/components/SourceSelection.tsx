import React from "react";
import { FolderOpen, Database, Loader2, AlertCircle, User as UserIcon, Check } from "lucide-react";
import { motion } from "motion/react";

interface SourceSelectionProps {
  onLoadFolder: () => void;
  onLoadDB: () => void;
  isLoading: boolean;
  dbStatus: "connecting" | "connected" | "disconnected";
  dbError: string | null;
  onRetryDb: () => void;
  currentUser: { name: string } | null;
  onSwitchUser: () => void;
}

export default function SourceSelection({
  onLoadFolder,
  onLoadDB,
  isLoading,
  dbStatus,
  dbError,
  onRetryDb,
  currentUser,
  onSwitchUser
}: SourceSelectionProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl animate-pulse delay-700" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10"
      >
        {/* Local Folder Card */}
        <button 
          onClick={onLoadFolder}
          disabled={isLoading}
          className="group relative bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-left transition-all hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <FolderOpen size={120} />
          </div>
          
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 border border-emerald-500/20">
            <FolderOpen size={28} />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">Local Folder</h2>
          <p className="text-neutral-500 text-sm mb-8 max-w-xs">
            Load images and YOLO annotations directly from your local file system. Perfect for offline work.
          </p>
          
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-widest">
            <span>Select Directory</span>
            <motion.div
              animate={{ x: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              →
            </motion.div>
          </div>
        </button>

        {/* MongoDB Card */}
        <div className="group relative bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-left transition-all hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Database size={120} />
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-500/20">
              <Database size={28} />
            </div>
            
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              dbStatus === "connected" 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                : "bg-amber-500/10 border-amber-500/20 text-amber-500"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${dbStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
              {dbStatus === "connected" ? "Connected" : "Disconnected"}
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">MongoDB Cloud</h2>
          <p className="text-neutral-500 text-sm mb-6 max-w-xs">
            Sync with your central database. Supports multi-user collaboration and versioned annotations.
          </p>

          {dbStatus === "disconnected" && (
            <div className="mb-6 p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] text-red-400 font-medium mb-1">Connection Error</p>
                <p className="text-[10px] text-neutral-500 line-clamp-2">{dbError || "Check your MONGODB_URI"}</p>
                <button 
                  onClick={onRetryDb}
                  className="mt-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          <div className="mt-auto">
            <button 
              onClick={onLoadDB}
              disabled={isLoading || dbStatus !== "connected"}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
              Connect to Database
            </button>
          </div>
        </div>
      </motion.div>

      {/* User Selection Footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 flex flex-col items-center gap-4"
      >
        <div className="flex items-center gap-4 px-6 py-3 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 border border-emerald-500/20">
            <UserIcon size={20} />
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Current Profile</p>
            <p className="text-sm font-bold text-white leading-tight">{currentUser?.name || "No User Selected"}</p>
          </div>
          <button 
            onClick={onSwitchUser}
            className="ml-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            Switch
          </button>
        </div>
        <p className="text-[10px] text-neutral-700 uppercase tracking-[0.3em] font-bold">Vipplav AI VisionLabel Pro v2.5</p>
      </motion.div>
    </div>
  );
}
