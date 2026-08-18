import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Code,
  FileCode,
  MoreVertical,
  ExternalLink,
  Trash2,
  FolderInput,
  Edit2,
  Maximize2,
  Grid,
  List,
  Folder as FolderIcon,
  Download,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Layers,
  FileDigit,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { ImageItem, Folder, SortOption } from '../types';

interface ImageGridProps {
  images: ImageItem[];
  folders: Folder[];
  selectedFolderId: string | null;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  sortOption: SortOption;
  setSortOption: (sort: SortOption) => void;
  onPreviewImage: (image: ImageItem) => void;
  onRenameImage: (image: ImageItem) => void;
  onDeleteImage: (image: ImageItem) => void;
  onRestoreImage: (image: ImageItem) => void;
  onBulkDelete: () => void;
  onBulkMove: (targetFolderId: string | null) => void;
  isTrashView?: boolean;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  folders,
  selectedFolderId,
  selectedIds,
  setSelectedIds,
  viewMode,
  setViewMode,
  sortOption,
  setSortOption,
  onPreviewImage,
  onRenameImage,
  onDeleteImage,
  onRestoreImage,
  onBulkDelete,
  onBulkMove,
  isTrashView = false
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'url' | 'md' | 'html' | 'all' | null>(null);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>('');
  const [showMoveModal, setShowMoveModal] = useState(false);

  // Natural alphanumeric sort client-side fallback / guarantee
  const sortedImages = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const list = [...images];

    list.sort((a, b) => {
      let comp = 0;
      switch (sortOption) {
        case 'folder_then_name_asc':
        case 'folder_then_name_desc': {
          const folderComp = collator.compare(a.folderPath || '', b.folderPath || '');
          if (folderComp !== 0) {
            comp = folderComp;
          } else {
            comp = collator.compare(a.originalFilename, b.originalFilename);
          }
          break;
        }
        case 'name_asc':
        case 'name_desc': {
          const nameComp = collator.compare(a.originalFilename, b.originalFilename);
          if (nameComp !== 0) {
            comp = nameComp;
          } else {
            comp = collator.compare(a.folderPath || '', b.folderPath || '');
          }
          break;
        }
        case 'folder_asc':
        case 'folder_desc': {
          const folderComp = collator.compare(a.folderPath || '', b.folderPath || '');
          if (folderComp !== 0) {
            comp = folderComp;
          } else {
            comp = collator.compare(a.originalFilename, b.originalFilename);
          }
          break;
        }
        case 'size_asc':
        case 'size_desc':
          comp = a.compressedSize - b.compressedSize;
          break;
        case 'createdAt_asc':
        case 'createdAt_desc':
        default:
          comp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      const isDesc = sortOption.endsWith('_desc');
      return isDesc ? -comp : comp;
    });

    return list;
  }, [images, sortOption]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === sortedImages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedImages.map((img) => img.id));
    }
  };

  const copyToClipboard = (text: string, id: string, type: 'url' | 'md' | 'html') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedType(null);
    }, 2000);
  };

  const copyBulkUrls = () => {
    const selected = sortedImages.filter((img) => selectedIds.includes(img.id));
    const urls = selected.map((img) => img.directUrl).join('\n');
    navigator.clipboard.writeText(urls);
    setCopiedType('all');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyAllVisibleSortedUrls = () => {
    const urls = sortedImages.map((img) => img.directUrl).join('\n');
    navigator.clipboard.writeText(urls);
    setCopiedType('all');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const handleColumnSort = (columnKey: 'name' | 'folder' | 'size' | 'date') => {
    if (columnKey === 'name') {
      setSortOption(sortOption === 'name_asc' ? 'name_desc' : 'name_asc');
    } else if (columnKey === 'folder') {
      setSortOption(sortOption === 'folder_asc' ? 'folder_desc' : 'folder_asc');
    } else if (columnKey === 'size') {
      setSortOption(sortOption === 'size_asc' ? 'size_desc' : 'size_asc');
    } else if (columnKey === 'date') {
      setSortOption(sortOption === 'createdAt_desc' ? 'createdAt_asc' : 'createdAt_desc');
    }
  };

  const getSortLabel = (opt: SortOption) => {
    switch (opt) {
      case 'folder_then_name_asc':
        return 'Folder → Filename (A-Z)';
      case 'folder_then_name_desc':
        return 'Folder → Filename (Z-A)';
      case 'name_asc':
        return 'Filename (A-Z)';
      case 'name_desc':
        return 'Filename (Z-A)';
      case 'folder_asc':
        return 'Folder Path (A-Z)';
      case 'folder_desc':
        return 'Folder Path (Z-A)';
      case 'createdAt_desc':
        return 'Upload Date (Newest)';
      case 'createdAt_asc':
        return 'Upload Date (Oldest)';
      case 'size_desc':
        return 'File Size (Largest)';
      case 'size_asc':
        return 'File Size (Smallest)';
      default:
        return 'Sort Options';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Action Header Bar */}
      <div className="p-3.5 md:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm sticky top-16 z-20 transition-colors">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
            <input
              type="checkbox"
              checked={sortedImages.length > 0 && selectedIds.length === sortedImages.length}
              onChange={handleSelectAll}
              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="select-none">Select All ({selectedIds.length}/{sortedImages.length})</span>
          </label>

          {/* Bulk Action Toolbar */}
          {selectedIds.length > 0 ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 animate-fadeIn">
              <button
                onClick={copyBulkUrls}
                className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 cursor-pointer transition-colors shadow-sm"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy {selectedIds.length} Selected URLs</span>
              </button>

              {!isTrashView && (
                <button
                  onClick={() => setShowMoveModal(true)}
                  className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span>Move</span>
                </button>
              )}

              <button
                onClick={onBulkDelete}
                className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isTrashView ? 'Delete Permanently' : 'Trash'}</span>
              </button>
            </div>
          ) : (
            /* Quick Copy All Visible URLs Button */
            sortedImages.length > 0 && (
              <button
                onClick={copyAllVisibleSortedUrls}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer shadow-sm ${
                  copiedType === 'all'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                }`}
                title="Copy all visible image links strictly ordered by current sort"
              >
                {copiedType === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>
                  {copiedType === 'all'
                    ? `Copied ${sortedImages.length} Sorted URLs!`
                    : `Copy All ${sortedImages.length} Sorted URLs`}
                </span>
              </button>
            )
          )}
        </div>

        {/* Right Controls: Sort Selector & View Mode Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Enhanced Sort Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 pl-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-indigo-500" />
              <span>Sort:</span>
            </span>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer py-1 pr-2 rounded"
            >
              <optgroup label="Hierarchical / Marketplace Grouping">
                <option value="folder_then_name_asc">📁 📄 Folder → Filename (A-Z) (Recommended)</option>
                <option value="folder_then_name_desc">📁 📄 Folder → Filename (Z-A)</option>
              </optgroup>
              <optgroup label="Filename Sorting">
                <option value="name_asc">📄 Filename (A-Z / 1, 2, 10)</option>
                <option value="name_desc">📄 Filename (Z-A)</option>
              </optgroup>
              <optgroup label="Folder Sorting">
                <option value="folder_asc">📁 Folder Path (A-Z)</option>
                <option value="folder_desc">📁 Folder Path (Z-A)</option>
              </optgroup>
              <optgroup label="Date & Size">
                <option value="createdAt_desc">🕒 Upload Date (Newest first)</option>
                <option value="createdAt_asc">🕒 Upload Date (Oldest first)</option>
                <option value="size_desc">⚖️ File Size (Largest first)</option>
                <option value="size_asc">⚖️ File Size (Smallest first)</option>
              </optgroup>
            </select>
          </div>

          {/* View mode toggle (Grid / List) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Sort Badge & Context Indicator */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Active Sort:</span>
          <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200/60 dark:border-indigo-800/60">
            {getSortLabel(sortOption)}
          </span>
        </div>

        <span>
          Showing <strong>{sortedImages.length}</strong> items
        </span>
      </div>

      {/* Main Content Area */}
      <div className="p-4 md:p-6 overflow-y-auto flex-1">
        {sortedImages.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl my-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <FolderIcon className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
              No images found in this view
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
              Upload images or folders to populate this directory.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedImages.map((img) => {
              const isSelected = selectedIds.includes(img.id);

              return (
                <div
                  key={img.id}
                  onClick={() => onPreviewImage(img)}
                  className={`group relative bg-white dark:bg-slate-800/90 rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col shadow-sm hover:shadow-md cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {/* Select Checkbox Overlay */}
                  <div
                    onClick={(e) => toggleSelect(img.id, e)}
                    className="absolute top-2.5 left-2.5 z-10 p-1 rounded-lg bg-slate-900/50 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-white/40 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                  </div>

                  {/* Thumbnail Image */}
                  <div className="aspect-square bg-slate-100 dark:bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    <img
                      src={img.thumbnailUrl}
                      alt={img.originalFilename}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Format Badge */}
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold uppercase bg-slate-900/70 backdrop-blur-md text-white px-1.5 py-0.5 rounded">
                      {img.extension}
                    </span>
                  </div>

                  {/* Card Meta & Quick Copy Actions */}
                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <p
                        className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate"
                        title={img.originalFilename}
                      >
                        {img.originalFilename}
                      </p>
                      {img.folderPath && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <FolderIcon className="w-2.5 h-2.5 text-amber-500" />
                          <span>{img.folderPath}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                        <span>{img.width}x{img.height}</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatBytes(img.compressedSize)}
                        </span>
                      </div>
                    </div>

                    {/* Direct URL Copy Button Bar */}
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => copyToClipboard(img.directUrl, img.id, 'url')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                          copiedId === img.id && copiedType === 'url'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                        }`}
                        title="Copy Direct URL"
                      >
                        {copiedId === img.id && copiedType === 'url' ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>

                      <a
                        href={img.directUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Open Direct Link in New Tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW with Interactive Column Headers */
          <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-500 uppercase tracking-wider text-[10px] select-none">
                  <th className="p-3 w-8"></th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                    onClick={() => handleColumnSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Filename</span>
                      {sortOption === 'name_asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-600" />
                      ) : sortOption === 'name_desc' ? (
                        <ArrowDown className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                    onClick={() => handleColumnSort('folder')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Folder Path</span>
                      {sortOption === 'folder_asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-600" />
                      ) : sortOption === 'folder_desc' ? (
                        <ArrowDown className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th className="p-3">Dimensions</th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                    onClick={() => handleColumnSort('size')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Size</span>
                      {sortOption === 'size_asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-600" />
                      ) : sortOption === 'size_desc' ? (
                        <ArrowDown className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th className="p-3">Direct Image URL</th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                    onClick={() => handleColumnSort('date')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Upload Date</span>
                      {sortOption === 'createdAt_asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-600" />
                      ) : sortOption === 'createdAt_desc' ? (
                        <ArrowDown className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {sortedImages.map((img) => {
                  const isSelected = selectedIds.includes(img.id);

                  return (
                    <tr
                      key={img.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors ${
                        isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelect(img.id, e as any)}
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={img.thumbnailUrl}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover bg-slate-100 dark:bg-slate-900"
                          />
                          <span
                            onClick={() => onPreviewImage(img)}
                            className="font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer truncate max-w-[200px]"
                          >
                            {img.originalFilename}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate max-w-[150px]">{img.folderPath || 'Root'}</span>
                        </div>
                      </td>

                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        {img.width} × {img.height}
                      </td>

                      <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                        {formatBytes(img.compressedSize)}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[220px] truncate select-all">
                        {img.directUrl}
                      </td>

                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(img.createdAt).toLocaleDateString()}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(img.directUrl, img.id, 'url')}
                            className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded text-indigo-600 dark:text-indigo-400 cursor-pointer transition-colors"
                            title="Copy URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {!isTrashView ? (
                            <>
                              <button
                                onClick={() => onRenameImage(img)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 cursor-pointer"
                                title="Rename"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => onDeleteImage(img)}
                                className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950 rounded text-rose-500 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => onRestoreImage(img)}
                              className="px-2 py-1 text-[10px] bg-emerald-600 text-white font-medium rounded-lg"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Move Folder Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              Move {selectedIds.length} Selected Images
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Select Destination Folder:</label>
              <select
                value={targetMoveFolder}
                onChange={(e) => setTargetMoveFolder(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">(Root Library)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.path}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onBulkMove(targetMoveFolder || null);
                  setShowMoveModal(false);
                }}
                className="px-4 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-600/20"
              >
                Move Files
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
