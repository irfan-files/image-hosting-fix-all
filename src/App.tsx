import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ImageGrid } from './components/ImageGrid';
import { UploadModal } from './components/UploadModal';
import { ImageDetailModal } from './components/ImageDetailModal';
import { MarketplaceMapping } from './components/MarketplaceMapping';
import { StatsView } from './components/StatsView';
import { SettingsModal } from './components/SettingsModal';

import { Folder, ImageItem, StorageStats, AppSettings, SortOption } from './types';
import { api } from './lib/api';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'stats' | 'marketplace'>('files');

  // Core Data State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // View Controls State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'all' | 'trash'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOption, setSortOption] = useState<SortOption>('folder_then_name_asc');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadModalTab, setUploadModalTab] = useState<'files' | 'zip'>('files');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);

  // Apply Dark Mode Class to Root HTML
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load Initial App Data
  const loadData = useCallback(async () => {
    try {
      const [foldersRes, statsRes, settingsRes] = await Promise.all([
        api.getFolders(),
        api.getStats(),
        api.getSettings()
      ]);

      setFolders(foldersRes.folders || []);
      setStats(statsRes.stats || null);
      setSettings(settingsRes.settings || null);
    } catch (err) {
      console.error('Failed loading app data:', err);
    }
  }, []);

  // Fetch Images when Filter Criteria Change
  const fetchImages = useCallback(async () => {
    try {
      const result = await api.getImages({
        folderId: selectedFolderId === null ? undefined : selectedFolderId,
        status: selectedView === 'trash' ? 'trash' : 'active',
        search: searchQuery || undefined,
        sortBy: sortOption,
        limit: 50000
      });
      setImages(result.images || []);
    } catch (err) {
      console.error('Failed fetching images:', err);
    }
  }, [selectedFolderId, selectedView, searchQuery, sortOption]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Folder Actions
  const handleCreateFolder = async (name: string, parentId?: string | null) => {
    await api.createFolder(name, parentId);
    loadData();
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await api.renameFolder(id, name);
    loadData();
    fetchImages();
  };

  const handleDeleteFolder = async (id: string) => {
    await api.deleteFolder(id);
    if (selectedFolderId === id) setSelectedFolderId(null);
    loadData();
    fetchImages();
  };

  // Single Image Actions
  const handleRenameImage = async (image: ImageItem) => {
    const newName = prompt('Enter new filename:', image.originalFilename);
    if (newName && newName.trim() !== image.originalFilename) {
      await api.renameImage(image.id, newName.trim());
      fetchImages();
      loadData();
      if (previewImage && previewImage.id === image.id) {
        setPreviewImage((prev) => (prev ? { ...prev, originalFilename: newName.trim() } : null));
      }
    }
  };

  const handleDeleteImage = async (image: ImageItem) => {
    const isPermanent = selectedView === 'trash';
    if (confirm(`Are you sure you want to ${isPermanent ? 'permanently delete' : 'trash'} "${image.originalFilename}"?`)) {
      await api.deleteImage(image.id, isPermanent);
      if (previewImage?.id === image.id) setPreviewImage(null);
      fetchImages();
      loadData();
    }
  };

  const handleRestoreImage = async (image: ImageItem) => {
    await api.restoreImage(image.id);
    fetchImages();
    loadData();
  };

  // Bulk Image Actions
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const isPermanent = selectedView === 'trash';
    if (confirm(`Process ${selectedIds.length} selected images (${isPermanent ? 'Permanent Delete' : 'Move to Trash'})?`)) {
      await api.bulkDeleteImages(selectedIds, isPermanent);
      setSelectedIds([]);
      fetchImages();
      loadData();
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    if (selectedIds.length === 0) return;
    await api.bulkMoveImages(selectedIds, targetFolderId);
    setSelectedIds([]);
    fetchImages();
    loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Global SaaS Header Navbar */}
      <Navbar
        stats={stats}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => {
          setUploadModalTab('files');
          setIsUploadOpen(true);
        }}
        onOpenUploadZip={() => {
          setUploadModalTab('zip');
          setIsUploadOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Main Body View Layout */}
      {activeTab === 'files' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Directory Folder Tree Sidebar */}
          <Sidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            selectedView={selectedView}
            onSelectView={setSelectedView}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />

          {/* Main Grid / List Image Browser */}
          <ImageGrid
            images={images}
            folders={folders}
            selectedFolderId={selectedFolderId}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            viewMode={viewMode}
            setViewMode={setViewMode}
            sortOption={sortOption}
            setSortOption={setSortOption}
            onPreviewImage={setPreviewImage}
            onRenameImage={handleRenameImage}
            onDeleteImage={handleDeleteImage}
            onRestoreImage={handleRestoreImage}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            isTrashView={selectedView === 'trash'}
          />
        </div>
      )}

      {activeTab === 'marketplace' && (
        <MarketplaceMapping images={images} folders={folders} />
      )}

      {activeTab === 'stats' && <StatsView stats={stats} />}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        folders={folders}
        currentFolderId={selectedFolderId}
        initialTab={uploadModalTab}
        onUploadSuccess={() => {
          fetchImages();
          loadData();
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={async (newSettings) => {
          await api.updateSettings(newSettings);
          loadData();
        }}
        onReindexSuccess={() => {
          loadData();
          fetchImages();
        }}
      />


      {/* Image Lightbox Detail Modal */}
      <ImageDetailModal
        image={previewImage}
        onClose={() => setPreviewImage(null)}
        onRename={handleRenameImage}
        onDelete={handleDeleteImage}
      />
    </div>
  );
}
