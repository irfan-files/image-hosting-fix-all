import { Router, Request, Response } from 'express';
import { db } from '../db/database';

export const folderRouter = Router();

// GET /api/folders - List all folders
folderRouter.get('/', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_admin';
  const folders = db.getFolders(userId);
  return res.json({ folders });
});

// POST /api/folders - Create folder
folderRouter.post('/', (req: Request, res: Response) => {
  const userId = req.body.userId || 'usr_admin';
  const { name, parentId, path: fullFolderPath } = req.body;

  if (fullFolderPath) {
    const folder = db.findOrCreateFolderPath(userId, fullFolderPath);
    return res.status(201).json({ folder });
  }

  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const folder = db.createFolder(userId, name, parentId || null);
  return res.status(201).json({ folder });
});

// PATCH /api/folders/:id - Rename folder
folderRouter.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'New folder name is required' });
  }

  const folder = db.renameFolder(id, name);
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  return res.json({ folder });
});

// DELETE /api/folders/:id - Delete folder
folderRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteFolder(id);
  if (!success) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  return res.json({ message: 'Folder deleted successfully' });
});
