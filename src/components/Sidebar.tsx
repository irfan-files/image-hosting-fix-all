import React, { useState } from 'react';
import {
  Folder as FolderIcon,
  FolderPlus,
  Image as ImageIcon,
  Trash2,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Search,
  MoreVertical,
  Edit2,
  Trash
} from 'lucide-react';
import { Folder } from '../types';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  selectedView: 'all' | 'trash';
  onSelectView: (view: 'all' | 'trash') => void;
  onCreateFolder: (name: string, parentId?: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  selectedView,
  onSelectView,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  searchQuery,
  setSearchQuery
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentId, setTargetParentId] = useState<string | null>(null);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), targetParentId);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleRenameSubmit = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolderName.trim()) return;
    onRenameFolder(id, editingFolderName.trim());
    setEditingFolderId(null);
  };

  // Build tree structure
  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildFolders = (parentId: string) => folders.filter((f) => f.parentId === parentId);

  const renderFolderItem = (folder: Folder, level = 0) => {
    const children = getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders[folder.id] ?? true;
    const isSelected = selectedFolderId === folder.id && selectedView === 'all';

    return (
      <div key={folder.id} className="select-none">
        <div
          onClick={() => {
            onSelectFolder(folder.id);
            onSelectView('all');
          }}
          className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
            isSelected
              ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          style={{ paddingLeft: `${level * 14 + 10}px` }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(folder.id, e)}
                className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            <FolderIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-500'}`} />

            {editingFolderId === folder.id ? (
              <form onSubmit={(e) => handleRenameSubmit(folder.id, e)} className="flex-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  autoFocus
                  onBlur={() => setEditingFolderId(null)}
                  className="w-full bg-white dark:bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white outline-none"
                />
              </form>
            ) : (
              <span className="truncate">{folder.name}</span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTargetParentId(folder.id);
                setShowNewFolderModal(true);
              }}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"
              title="Add Subfolder"
            >
              <FolderPlus className="w-3 h-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingFolderId(folder.id);
                setEditingFolderName(folder.name);
              }}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"
              title="Rename Folder"
            >
              <Edit2 className="w-3 h-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete folder "${folder.name}" and move items to trash?`)) {
                  onDeleteFolder(folder.id);
                }
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-950/60 rounded text-red-500"
              title="Delete Folder"
            >
              <Trash className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5">{children.map((child) => renderFolderItem(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto transition-colors">
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search images/folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {/* System Views */}
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2.5 mb-1">
            Library
          </div>

          <button
            onClick={() => {
              onSelectFolder(null);
              onSelectView('all');
            }}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
              selectedFolderId === null && selectedView === 'all'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/20'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>All Images</span>
          </button>

          <button
            onClick={() => onSelectView('trash')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
              selectedView === 'trash'
                ? 'bg-rose-600 text-white font-semibold shadow-sm shadow-rose-600/20'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4" />
              <span>Trash</span>
            </div>
          </button>
        </div>

        {/* Directory Folder Tree */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-2">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Folders
            </span>
            <button
              onClick={() => {
                setTargetParentId(null);
                setShowNewFolderModal(true);
              }}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-indigo-600 dark:text-indigo-400"
              title="Create Root Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {rootFolders.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic px-2.5 py-1">No folders created yet</p>
            ) : (
              rootFolders.map((folder) => renderFolderItem(folder))
            )}
          </div>
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              {targetParentId ? 'Create Subfolder' : 'Create Folder'}
            </h3>
            <form onSubmit={handleCreateFolderSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="e.g. iPhone 15 Pro, Apparel, Catalog..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-600/20"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
