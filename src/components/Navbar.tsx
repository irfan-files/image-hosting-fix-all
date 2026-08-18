import React from 'react';
import { Image, Upload, Settings as SettingsIcon, Sun, Moon, HardDrive, BarChart3, ShoppingBag, FileArchive } from 'lucide-react';
import { StorageStats } from '../types';

interface NavbarProps {
  stats: StorageStats | null;
  activeTab: 'files' | 'stats' | 'marketplace';
  setActiveTab: (tab: 'files' | 'stats' | 'marketplace') => void;
  onOpenUpload: () => void;
  onOpenUploadZip: () => void;
  onOpenSettings: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  stats,
  activeTab,
  setActiveTab,
  onOpenUpload,
  onOpenUploadZip,
  onOpenSettings,
  darkMode,
  setDarkMode
}) => {
  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-4 md:px-6 flex items-center justify-between transition-colors">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Image className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">PicMarket</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
              Pro Host
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Marketplace Image Hosting & Direct URL Engine
          </p>
        </div>
      </div>

      {/* Center Nav Tabs */}
      <nav className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'files'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Image className="w-4 h-4" />
          <span>File Manager</span>
        </button>

        <button
          onClick={() => setActiveTab('marketplace')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'marketplace'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Marketplace Mapping</span>
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'stats'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Storage Stats</span>
        </button>
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Storage Quick Pill */}
        {stats && (
          <div className="hidden lg:flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
            <span>{formatBytes(stats.compressedStorageBytes)}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">({stats.savedPercentage}% saved)</span>
          </div>
        )}

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
          title="Upload file atau folder biasa"
        >
          <Upload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          <span className="hidden sm:inline">Upload File</span>
        </button>

        <button
          onClick={onOpenUploadZip}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-[0.98] text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          title="Upload 1 file ZIP berisi ribuan gambar & folder untuk diekstrak otomatis dan dibuatkan direct link"
        >
          <FileArchive className="w-4 h-4" />
          <span>Upload .ZIP</span>
        </button>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          title="Toggle theme"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
