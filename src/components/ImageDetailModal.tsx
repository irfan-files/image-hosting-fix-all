import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  ExternalLink,
  Trash2,
  Edit2,
  Code,
  FileCode,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { ImageItem } from '../types';

interface ImageDetailModalProps {
  image: ImageItem | null;
  onClose: () => void;
  onRename: (image: ImageItem) => void;
  onDelete: (image: ImageItem) => void;
}

export const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
  image,
  onClose,
  onRename,
  onDelete
}) => {
  const [copiedType, setCopiedType] = useState<'url' | 'md' | 'html' | null>(null);

  if (!image) return null;

  const markdownSnippet = `![${image.originalFilename}](${image.directUrl})`;
  const htmlSnippet = `<img src="${image.directUrl}" alt="${image.originalFilename}" />`;

  const copyToClipboard = (text: string, type: 'url' | 'md' | 'html') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const savedBytes = Math.max(0, image.originalSize - image.compressedSize);
  const savedPercent = image.originalSize > 0 ? ((savedBytes / image.originalSize) * 100).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col lg:flex-row overflow-hidden shadow-2xl transition-colors">
        {/* Left Side: Preview Image Canvas */}
        <div className="flex-1 bg-slate-950 flex items-center justify-center p-6 relative group min-h-[300px] lg:min-h-[500px]">
          <img
            src={image.directUrl}
            alt={image.originalFilename}
            className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
          />

          <a
            href={image.directUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute top-4 left-4 bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-xl backdrop-blur-md flex items-center gap-1.5 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Direct File</span>
          </a>
        </div>

        {/* Right Side: Metadata & Export Snippets */}
        <div className="w-full lg:w-96 p-6 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-y-auto bg-white dark:bg-slate-900">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="overflow-hidden pr-2">
                <span className="text-[10px] font-bold uppercase bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                  {image.extension}
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1.5 truncate" title={image.originalFilename}>
                  {image.originalFilename}
                </h3>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Direct Image URL Quick Copy Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Direct Image Public URL
              </label>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 p-2 rounded-xl">
                <input
                  type="text"
                  readOnly
                  value={image.directUrl}
                  className="bg-transparent text-xs text-slate-700 dark:text-slate-200 font-mono w-full focus:outline-none truncate select-all"
                />
                <button
                  onClick={() => copyToClipboard(image.directUrl, 'url')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                    copiedType === 'url'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20'
                  }`}
                >
                  {copiedType === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === 'url' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Markdown & HTML Embed Code */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => copyToClipboard(markdownSnippet, 'md')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between cursor-pointer ${
                  copiedType === 'md'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span className="flex items-center gap-1 text-[11px]"><Code className="w-3.5 h-3.5" /> Markdown</span>
                  {copiedType === 'md' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3 h-3 opacity-60" />}
                </div>
                <span className="text-[10px] text-slate-400 font-mono truncate">{markdownSnippet}</span>
              </button>

              <button
                onClick={() => copyToClipboard(htmlSnippet, 'html')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between cursor-pointer ${
                  copiedType === 'html'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between font-semibold mb-1">
                  <span className="flex items-center gap-1 text-[11px]"><FileCode className="w-3.5 h-3.5" /> HTML</span>
                  {copiedType === 'html' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3 h-3 opacity-60" />}
                </div>
                <span className="text-[10px] text-slate-400 font-mono truncate">{htmlSnippet}</span>
              </button>
            </div>

            {/* Technical Metadata Table */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">File Details</span>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Folder Path:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{image.folderPath || 'Root'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Dimensions:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{image.width} × {image.height} px</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Original Size:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{formatBytes(image.originalSize)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Compressed Size:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBytes(image.compressedSize)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Storage Saved:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{savedPercent}% ({formatBytes(savedBytes)})</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Checksum (SHA256):</span>
                  <span className="font-mono text-[10px] text-slate-500 truncate max-w-[150px]" title={image.checksum}>
                    {image.checksum}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <button
              onClick={() => onRename(image)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold py-2 rounded-xl transition-all cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Rename</span>
            </button>

            <button
              onClick={() => onDelete(image)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold py-2 rounded-xl transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Trash</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
