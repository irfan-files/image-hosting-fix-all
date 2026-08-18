import React from 'react';
import {
  HardDrive,
  FileImage,
  Folder,
  Sparkles,
  TrendingDown,
  PieChart,
  CheckCircle2
} from 'lucide-react';
import { StorageStats } from '../types';

interface StatsViewProps {
  stats: StorageStats | null;
}

export const StatsView: React.FC<StatsViewProps> = ({ stats }) => {
  if (!stats) return <div className="p-8 text-center text-slate-400">Loading storage metrics...</div>;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Images */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Hosted Images</span>
            <FileImage className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalImages.toLocaleString()}</p>
          <p className="text-[11px] text-slate-500">Across {stats.totalFolders} directory folders</p>
        </div>

        {/* Current Storage Used */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Storage Usage</span>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatBytes(stats.compressedStorageBytes)}</p>
          <p className="text-[11px] text-slate-500">Original raw size: {formatBytes(stats.originalStorageBytes)}</p>
        </div>

        {/* Storage Saved */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Storage Saved</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            {formatBytes(stats.storageSavedBytes)}
          </p>
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {stats.savedPercentage}% bandwidth & disk reduction
          </p>
        </div>

        {/* Compression Efficiency */}
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Compression Target</span>
            <TrendingDown className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">&le; 2 MB / file</p>
          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">Adaptive multi-pass Sharp quality engine</p>
        </div>
      </div>

      {/* Format Breakdown & Recent Uploads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Format Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Image Format Distribution</h3>
          </div>

          <div className="space-y-3">
            {Object.entries(stats.imagesByFormat).length === 0 ? (
              <p className="text-xs text-slate-400">No images uploaded yet</p>
            ) : (
              Object.entries(stats.imagesByFormat).map(([fmt, count]) => {
                const numCount = Number(count) || 0;
                const percent = stats.totalImages > 0 ? ((numCount / stats.totalImages) * 100).toFixed(1) : 0;
                return (
                  <div key={fmt} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase">{fmt}</span>
                      <span className="text-slate-400">{numCount} files ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Recent Uploads</h3>

          <div className="space-y-2">
            {stats.recentUploads.length === 0 ? (
              <p className="text-xs text-slate-400">No recent activity</p>
            ) : (
              stats.recentUploads.map((img) => (
                <div
                  key={img.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <img src={img.thumbnailUrl} className="w-8 h-8 rounded object-cover" alt="" />
                    <div className="overflow-hidden">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{img.originalFilename}</p>
                      <p className="text-[10px] text-slate-400">{img.folderPath || 'Root'}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatBytes(img.compressedSize)}</p>
                    <p className="text-[10px] text-slate-400">{new Date(img.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
