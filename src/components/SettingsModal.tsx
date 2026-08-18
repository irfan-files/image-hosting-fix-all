import React, { useState } from 'react';
import { X, Settings as SettingsIcon, Save, HardDrive, Check, RefreshCw, Sparkles, Database, Trash2 } from 'lucide-react';
import { AppSettings } from '../types';
import { api } from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
  onReindexSuccess?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onReindexSuccess
}) => {
  const [formData, setFormData] = useState<AppSettings>(
    settings || {
      targetImageSizeMb: 2,
      defaultQuality: 85,
      keepOriginal: false,
      outputFormat: 'keep',
      uploadConcurrency: 5,
      publicImageUrl: '',
      storageDriver: 'local',
      duplicateAction: 'allow'
    }
  );
  const [saved, setSaved] = useState(false);
  const [isSyncingDisk, setIsSyncingDisk] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSyncDisk = async () => {
    setIsSyncingDisk(true);
    setSyncMessage(null);
    try {
      const res = await api.reindexStorage();
      setSyncMessage(res.message || `Berhasil mensinkronkan storage disk. Total: ${res.total} gambar.`);
      if (onReindexSuccess) {
        onReindexSuccess();
      }
    } catch (e: any) {
      setSyncMessage(`Gagal sinkronisasi: ${e.message}`);
    } finally {
      setIsSyncingDisk(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };


  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-slate-900 dark:text-white text-base">
              System & Compression Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Target File Size MB */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Target Maximum Image Size (MB)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="20"
              value={formData.targetImageSizeMb}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, targetImageSizeMb: parseFloat(e.target.value) || 2 }))
              }
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[10px] text-slate-400">
              Images above this size will be automatically compressed step-by-step down to this ceiling limit.
            </p>
          </div>

          {/* Initial Quality */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Initial Quality Baseline ({formData.defaultQuality}%)
            </label>
            <input
              type="range"
              min="50"
              max="100"
              value={formData.defaultQuality}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, defaultQuality: parseInt(e.target.value, 10) }))
              }
              className="w-full accent-indigo-600"
            />
          </div>

          {/* Output Format */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 dark:text-slate-200">Output Format Strategy</label>
            <select
              value={formData.outputFormat}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, outputFormat: e.target.value as any }))
              }
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="keep">Keep Original Format (JPG/PNG/WEBP)</option>
              <option value="jpeg">Convert All to Web-optimized JPEG</option>
              <option value="webp">Convert All to WebP</option>
            </select>
          </div>

          {/* Duplicate Action */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 dark:text-slate-200">Duplicate Checksum Action</label>
            <select
              value={formData.duplicateAction}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, duplicateAction: e.target.value as any }))
              }
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="allow">Simpan Semua / Allow Duplicates (Direkomendasikan)</option>
              <option value="skip">Lewati Duplikat / Skip Duplicate Files</option>
            </select>
          </div>

          {/* Public Custom Domain / CDN Base URL */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Public Image Custom Domain / Base URL (Opsional)
            </label>
            <input
              type="text"
              placeholder="Biarkan KOSONG agar otomatis mengikuti IP / Host (e.g. 192.168.x.x:3000)"
              value={formData.publicImageUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, publicImageUrl: e.target.value }))
              }
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Jika dikosongkan, link gambar akan 100% fleksibel mengikuti IP Address/domain komputer yang sedang membuka aplikasi di jaringan lokal (LAN) maupun internet.
            </p>
          </div>

          {/* Disk Auto-Recovery & Storage Synchronizer */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  Sinkronisasi & Pemulihan Storage Disk
                </span>
              </div>
              <button
                type="button"
                onClick={handleSyncDisk}
                disabled={isSyncingDisk}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDisk ? 'animate-spin' : ''}`} />
                <span>{isSyncingDisk ? 'Memindai Disk...' : 'Pindai & Pulihkan Disk'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  Bersihkan Duplikat & Normalisasi Nama
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setIsSyncingDisk(true);
                  try {
                    const res = await api.cleanupDuplicates();
                    setSyncMessage(res.message);
                    if (onReindexSuccess) onReindexSuccess();
                  } catch (e: any) {
                    setSyncMessage(`Gagal membersihkan: ${e.message}`);
                  } finally {
                    setIsSyncingDisk(false);
                  }
                }}
                disabled={isSyncingDisk}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900 text-xs font-semibold rounded-lg border border-amber-200 dark:border-amber-800 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Bersihkan Duplikat</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  Bersihkan File Temp (.ZIP & Upload Sisa)
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setIsSyncingDisk(true);
                  try {
                    const res = await api.cleanTempFiles();
                    setSyncMessage(res.message);
                  } catch (e: any) {
                    setSyncMessage(`Gagal membersihkan temp: ${e.message}`);
                  } finally {
                    setIsSyncingDisk(false);
                  }
                }}
                disabled={isSyncingDisk}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan Temp</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Menghapus akhiran hash acak, menghapus entri duplikat, dan mengosongkan file sementara (.zip temp) agar storage disk selalu bersih dan efisien.
            </p>
            {syncMessage && (
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                {syncMessage}
              </p>
            )}
          </div>

          {/* Footer Actions */}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saved ? 'Saved!' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
