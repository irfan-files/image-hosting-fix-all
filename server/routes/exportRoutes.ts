import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { ExportService } from '../services/exportService';
import { ExportColumnOptions } from '../../src/types';
import { getRequestBaseUrl } from './imageRoutes';

export const exportRouter = Router();

// GET /api/export/csv - Download CSV
exportRouter.get('/csv', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_admin';
  const folderId = req.query.folderId as string | undefined;
  const baseUrl = getRequestBaseUrl(req);

  const result = db.getImages(userId, { folderId, status: 'active', limit: 10000 }, baseUrl);
  const columns: ExportColumnOptions = {
    folder: req.query.folder !== 'false',
    filename: req.query.filename !== 'false',
    directUrl: req.query.directUrl !== 'false',
    originalSize: req.query.originalSize !== 'false',
    compressedSize: req.query.compressedSize !== 'false',
    width: req.query.width !== 'false',
    height: req.query.height !== 'false',
    format: req.query.format !== 'false',
    uploadDate: req.query.uploadDate !== 'false'
  };

  const csv = ExportService.generateCSV(result.images, columns);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=marketplace_images_${Date.now()}.csv`);
  return res.send(csv);
});

// GET /api/export/xlsx - Download XLSX Excel file
exportRouter.get('/xlsx', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'usr_admin';
    const folderId = req.query.folderId as string | undefined;
    const baseUrl = getRequestBaseUrl(req);

    const result = db.getImages(userId, { folderId, status: 'active', limit: 10000 }, baseUrl);
    const columns: ExportColumnOptions = {
      folder: req.query.folder !== 'false',
      filename: req.query.filename !== 'false',
      directUrl: req.query.directUrl !== 'false',
      originalSize: req.query.originalSize !== 'false',
      compressedSize: req.query.compressedSize !== 'false',
      width: req.query.width !== 'false',
      height: req.query.height !== 'false',
      format: req.query.format !== 'false',
      uploadDate: req.query.uploadDate !== 'false'
    };

    const xlsxBuffer = await ExportService.generateXLSX(result.images, columns);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=marketplace_images_${Date.now()}.xlsx`);
    return res.send(xlsxBuffer);
  } catch (error: any) {
    console.error('Error exporting XLSX:', error);
    return res.status(500).json({ error: error.message || 'XLSX export failed' });
  }
});

// GET /api/export/marketplace - Download Marketplace Product Matrix XLSX
exportRouter.get('/marketplace', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'usr_admin';
    const baseUrl = getRequestBaseUrl(req);
    const result = db.getImages(userId, { status: 'active', limit: 10000 }, baseUrl);

    const matrixBuffer = await ExportService.generateMarketplaceMatrixXLSX(result.images);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=marketplace_products_matrix_${Date.now()}.xlsx`);
    return res.send(matrixBuffer);
  } catch (error: any) {
    console.error('Error exporting marketplace matrix:', error);
    return res.status(500).json({ error: error.message || 'Marketplace export failed' });
  }
});
