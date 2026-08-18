import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Folder,
  ShoppingBag,
  Layers,
  Settings2,
  Table,
  ArrowUpDown,
  Search,
  CheckCircle2,
  FileDigit,
  SortAsc,
  SortDesc,
  ExternalLink
} from 'lucide-react';
import { ImageItem, Folder as FolderType, ExportColumnOptions } from '../types';

interface MarketplaceMappingProps {
  images: ImageItem[];
  folders: FolderType[];
}

export const MarketplaceMapping: React.FC<MarketplaceMappingProps> = ({ images, folders }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [folderSort, setFolderSort] = useState<'name_asc' | 'name_desc' | 'count_desc' | 'count_asc'>('name_asc');
  const [fileSort, setFileSort] = useState<'name_asc' | 'name_desc' | 'date_desc' | 'date_asc'>('name_asc');

  const [columns, setColumns] = useState<ExportColumnOptions>({
    folder: true,
    filename: true,
    directUrl: true,
    originalSize: true,
    compressedSize: true,
    width: true,
    height: true,
    format: true,
    uploadDate: true
  });

  // Naturally sort and group images by folder and filename
  const sortedAndGrouped = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const groups: Record<string, ImageItem[]> = {};

    // Filter if search provided
    const filteredImages = filterSearch
      ? images.filter(
          (img) =>
            (img.folderPath && img.folderPath.toLowerCase().includes(filterSearch.toLowerCase())) ||
            img.originalFilename.toLowerCase().includes(filterSearch.toLowerCase())
        )
      : images;

    // Grouping
    filteredImages.forEach((img) => {
      const key = img.folderPath || 'Root Folder';
      if (!groups[key]) groups[key] = [];
      groups[key].push(img);
    });

    // Sort files inside each folder
    Object.keys(groups).forEach((folderKey) => {
      groups[folderKey].sort((a, b) => {
        let comp = 0;
        if (fileSort === 'name_asc' || fileSort === 'name_desc') {
          comp = collator.compare(a.originalFilename, b.originalFilename);
          if (fileSort === 'name_desc') comp = -comp;
        } else if (fileSort === 'date_desc' || fileSort === 'date_asc') {
          comp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (fileSort === 'date_desc') comp = -comp;
        }
        return comp;
      });
    });

    // Sort folder keys
    const sortedFolderKeys = Object.keys(groups).sort((a, b) => {
      if (folderSort === 'name_asc') return collator.compare(a, b);
      if (folderSort === 'name_desc') return collator.compare(b, a);
      if (folderSort === 'count_desc') return groups[b].length - groups[a].length;
      if (folderSort === 'count_asc') return groups[a].length - groups[b].length;
      return 0;
    });

    return { groups, sortedFolderKeys };
  }, [images, filterSearch, folderSort, fileSort]);

  const handleExportCSV = () => {
    const query = new URLSearchParams();
    Object.entries(columns).forEach(([key, val]) => query.set(key, String(val)));
    query.set('sortBy', 'folder_then_name_asc');
    window.open(`/api/export/csv?${query.toString()}`, '_blank');
  };

  const handleExportXLSX = () => {
    const query = new URLSearchParams();
    Object.entries(columns).forEach(([key, val]) => query.set(key, String(val)));
    query.set('sortBy', 'folder_then_name_asc');
    window.open(`/api/export/xlsx?${query.toString()}`, '_blank');
  };

  const handleExportMarketplaceMatrix = () => {
    window.open('/api/export/marketplace', '_blank');
  };

  const copyFullTextMapping = () => {
    let mappingText = '';
    sortedAndGrouped.sortedFolderKeys.forEach((folderPath) => {
      const imgList = sortedAndGrouped.groups[folderPath];
      mappingText += `=== ${folderPath} (${imgList.length} images) ===\n`;
      imgList.forEach((img, idx) => {
        mappingText += `[${idx + 1}] ${img.originalFilename} -> ${img.directUrl}\n`;
      });
      mappingText += '\n';
    });

    navigator.clipboard.writeText(mappingText);
    setCopied('text');
    setTimeout(() => setCopied(null), 2500);
  };

  const copyAllOrderedLinks = () => {
    const urls: string[] = [];
    sortedAndGrouped.sortedFolderKeys.forEach((folderPath) => {
      const imgList = sortedAndGrouped.groups[folderPath];
      imgList.forEach((img) => urls.push(img.directUrl));
    });

    navigator.clipboard.writeText(urls.join('\n'));
    setCopied('urls');
    setTimeout(() => setCopied(null), 2500);
  };

  const copyFolderUrls = (folderPath: string) => {
    const imgList = sortedAndGrouped.groups[folderPath] || [];
    const urls = imgList.map((img) => img.directUrl).join('\n');
    navigator.clipboard.writeText(urls);
    setCopied(folderPath);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs tracking-wider uppercase">
            <ShoppingBag className="w-4 h-4" />
            <span>Shopee • Tokopedia • Lazada • TikTok Shop Ready</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            Marketplace Image Mapping & Ordered Exporter
          </h2>
          <p className="text-xs md:text-sm text-slate-300 max-w-xl">
            Automatically sequences your product folder hierarchy and image filenames in natural numerical order (1, 2, 3... 10) for direct spreadsheet insertion.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={copyAllOrderedLinks}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {copied === 'urls' ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copied === 'urls' ? 'Copied All URLs!' : 'Copy All Ordered URLs'}</span>
          </button>

          <button
            onClick={handleExportMarketplaceMatrix}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Matrix (.xlsx)</span>
          </button>

          <button
            onClick={copyFullTextMapping}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-4 py-2.5 rounded-xl backdrop-blur-md transition-all cursor-pointer border border-white/20"
          >
            {copied === 'text' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied === 'text' ? 'Copied Text Mapping!' : 'Copy Text Mapping'}</span>
          </button>
        </div>
      </div>

      {/* Sorting & Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product folder or filename..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Folder Sort */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Folder Sort:</span>
              <select
                value={folderSort}
                onChange={(e) => setFolderSort(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="name_asc">Folder Path (A-Z Natural)</option>
                <option value="name_desc">Folder Path (Z-A)</option>
                <option value="count_desc">Image Count (Most First)</option>
                <option value="count_asc">Image Count (Fewest First)</option>
              </select>
            </div>

            {/* File Sort */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <FileDigit className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">File Sort:</span>
              <select
                value={fileSort}
                onChange={(e) => setFileSort(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="name_asc">Filename (A-Z / 1, 2, 10)</option>
                <option value="name_desc">Filename (Z-A)</option>
                <option value="date_desc">Upload Date (Newest)</option>
                <option value="date_asc">Upload Date (Oldest)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Column Exporter Toggles & Action */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
              Export Columns & Options
            </h3>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV (Sorted)
            </button>
            <button
              onClick={handleExportXLSX}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer shadow-sm shadow-indigo-600/20 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX (Sorted)
            </button>
          </div>
        </div>

        {/* Column Checkboxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
          {Object.entries(columns).map(([key, enabled]) => (
            <label
              key={key}
              className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300 capitalize text-[11px]">
                {key.replace(/([A-Z])/g, ' $1')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Directory Folder Mapping Matrix Preview */}
      <div className="space-y-4">
        {sortedAndGrouped.sortedFolderKeys.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
            No folders or images match your filter.
          </div>
        ) : (
          sortedAndGrouped.sortedFolderKeys.map((folderPath) => {
            const imgList = sortedAndGrouped.groups[folderPath];
            const isFolderCopied = copied === folderPath;

            return (
              <div
                key={folderPath}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
              >
                {/* Folder Header */}
                <div className="bg-slate-50 dark:bg-slate-800/60 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-200 text-sm">
                    <Folder className="w-4 h-4 text-amber-500" />
                    <span>{folderPath}</span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-full">
                      {imgList.length} items
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyFolderUrls(folderPath)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        isFolderCopied
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                      }`}
                      title="Copy all URLs in this folder in order"
                    >
                      {isFolderCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isFolderCopied ? 'Copied Folder URLs!' : 'Copy Folder URLs'}</span>
                    </button>
                  </div>
                </div>

                {/* Table of Images in Sequence */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[10px] uppercase font-semibold bg-slate-50/50 dark:bg-slate-900/30">
                        <th className="p-3 w-12 text-center">No</th>
                        <th className="p-3">Filename (Sorted A-Z)</th>
                        <th className="p-3">Direct Image URL</th>
                        <th className="p-3 text-right">Copy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {imgList.map((img, idx) => (
                        <tr key={img.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2.5">
                            <img
                              src={img.thumbnailUrl}
                              className="w-7 h-7 rounded-lg object-cover bg-slate-100 dark:bg-slate-800"
                              alt=""
                            />
                            <span className="truncate max-w-[220px] font-mono text-[12px]">{img.originalFilename}</span>
                          </td>
                          <td className="p-3 font-mono text-slate-500 dark:text-slate-400 select-all max-w-[450px] truncate text-[11px]">
                            {img.directUrl}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(img.directUrl);
                                setCopied(img.id);
                                setTimeout(() => setCopied(null), 1500);
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                copied === img.id
                                  ? 'bg-emerald-600 text-white'
                                  : 'hover:bg-indigo-50 dark:hover:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                              }`}
                              title="Copy Direct URL"
                            >
                              {copied === img.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
