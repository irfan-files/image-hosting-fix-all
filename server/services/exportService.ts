import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { ImageItem, ExportColumnOptions, MarketplaceMappingRow } from '../../src/types';

export class ExportService {
  /**
   * Helper to naturally sort image array by folder path then filename
   */
  public static sortImagesNaturally(images: ImageItem[]): ImageItem[] {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...images].sort((a, b) => {
      const folderComp = collator.compare(a.folderPath || '', b.folderPath || '');
      if (folderComp !== 0) return folderComp;
      return collator.compare(a.originalFilename, b.originalFilename);
    });
  }

  /**
   * Helper to format bytes to human readable string
   */
  public static formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Generates CSV string with UTF-8 BOM for Excel compatibility
   */
  public static generateCSV(images: ImageItem[], columns: ExportColumnOptions): string {
    const sorted = this.sortImagesNaturally(images);
    const rows = sorted.map((img) => {
      const row: Record<string, string | number> = {};

      if (columns.folder) row['Folder'] = img.folderPath || 'Root';
      if (columns.filename) row['Filename'] = img.originalFilename;
      if (columns.directUrl) row['Direct Image URL'] = img.directUrl;
      if (columns.originalSize) row['Original Size'] = this.formatBytes(img.originalSize);
      if (columns.compressedSize) row['Compressed Size'] = this.formatBytes(img.compressedSize);
      if (columns.width) row['Width (px)'] = img.width;
      if (columns.height) row['Height (px)'] = img.height;
      if (columns.format) row['Format'] = img.extension.toUpperCase();
      if (columns.uploadDate) row['Upload Date'] = new Date(img.createdAt).toLocaleString();

      return row;
    });

    const csvContent = Papa.unparse(rows);
    // Add UTF-8 BOM (\uFEFF) for Excel compatibility
    return '\uFEFF' + csvContent;
  }

  /**
   * Generates formatted Excel Workbook buffer (.xlsx)
   */
  public static async generateXLSX(images: ImageItem[], columns: ExportColumnOptions): Promise<Buffer> {
    const sorted = this.sortImagesNaturally(images);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PicMarket';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Image Catalog', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const colHeaders: { header: string; key: string; width: number }[] = [];

    if (columns.folder) colHeaders.push({ header: 'Folder Path', key: 'folderPath', width: 30 });
    if (columns.filename) colHeaders.push({ header: 'Filename', key: 'originalFilename', width: 35 });
    if (columns.directUrl) colHeaders.push({ header: 'Direct Image URL', key: 'directUrl', width: 60 });
    if (columns.originalSize) colHeaders.push({ header: 'Original Size', key: 'originalSizeFormatted', width: 15 });
    if (columns.compressedSize) colHeaders.push({ header: 'Compressed Size', key: 'compressedSizeFormatted', width: 15 });
    if (columns.width) colHeaders.push({ header: 'Width (px)', key: 'width', width: 12 });
    if (columns.height) colHeaders.push({ header: 'Height (px)', key: 'height', width: 12 });
    if (columns.format) colHeaders.push({ header: 'Format', key: 'extension', width: 12 });
    if (columns.uploadDate) colHeaders.push({ header: 'Upload Date', key: 'createdAtFormatted', width: 22 });

    worksheet.columns = colHeaders;

    // Header styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2563EB' } // Royal blue header
    };
    worksheet.getRow(1).height = 24;

    sorted.forEach((img) => {
      const rowData: Record<string, any> = {};
      if (columns.folder) rowData['folderPath'] = img.folderPath || 'Root';
      if (columns.filename) rowData['originalFilename'] = img.originalFilename;
      if (columns.directUrl) rowData['directUrl'] = img.directUrl;
      if (columns.originalSize) rowData['originalSizeFormatted'] = this.formatBytes(img.originalSize);
      if (columns.compressedSize) rowData['compressedSizeFormatted'] = this.formatBytes(img.compressedSize);
      if (columns.width) rowData['width'] = img.width;
      if (columns.height) rowData['height'] = img.height;
      if (columns.format) rowData['extension'] = img.extension.toUpperCase();
      if (columns.uploadDate) rowData['createdAtFormatted'] = new Date(img.createdAt).toLocaleString();

      const row = worksheet.addRow(rowData);
      row.height = 20;

      // Make direct URL clickable hyperlink
      if (columns.directUrl && img.directUrl) {
        const urlCell = row.getCell('directUrl');
        urlCell.value = {
          text: img.directUrl,
          hyperlink: img.directUrl,
          tooltip: 'Click to open direct image'
        };
        urlCell.font = { color: { argb: '1D4ED8' }, underline: true };
      }
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Generates Marketplace Product Matrix XLSX (e.g. Shopee / Tokopedia product template)
   * Product Folder | Image 1 | Image 2 | Image 3 | Image 4 | Image 5
   */
  public static async generateMarketplaceMatrixXLSX(images: ImageItem[]): Promise<Buffer> {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Marketplace Template');

    // Group images by folderPath
    const grouped: Record<string, ImageItem[]> = {};
    images.forEach((img) => {
      const key = img.folderPath || 'Default Product';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(img);
    });

    // Sort files inside each group naturally by originalFilename
    Object.keys(grouped).forEach((folder) => {
      grouped[folder].sort((a, b) => collator.compare(a.originalFilename, b.originalFilename));
    });

    let maxImagesInGroup = 1;
    Object.values(grouped).forEach((imgs) => {
      if (imgs.length > maxImagesInGroup) maxImagesInGroup = imgs.length;
    });

    const colHeaders: { header: string; key: string; width: number }[] = [
      { header: 'Product Name / Folder', key: 'productName', width: 35 }
    ];

    for (let i = 1; i <= Math.min(maxImagesInGroup, 10); i++) {
      colHeaders.push({ header: `Product Image ${i}`, key: `img_${i}`, width: 55 });
    }

    worksheet.columns = colHeaders;

    // Styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '059669' } // Emerald green
    };
    worksheet.getRow(1).height = 24;

    // Sort folders naturally
    const sortedFolderKeys = Object.keys(grouped).sort((a, b) => collator.compare(a, b));

    sortedFolderKeys.forEach((folderPath) => {
      const imgList = grouped[folderPath];
      const rowData: Record<string, any> = {
        productName: folderPath
      };

      imgList.slice(0, 10).forEach((img, idx) => {
        rowData[`img_${idx + 1}`] = img.directUrl;
      });

      const row = worksheet.addRow(rowData);
      row.height = 20;

      // Hyperlink formatting for image columns
      imgList.slice(0, 10).forEach((img, idx) => {
        const cell = row.getCell(`img_${idx + 1}`);
        cell.value = {
          text: img.directUrl,
          hyperlink: img.directUrl,
          tooltip: img.originalFilename
        };
        cell.font = { color: { argb: '047857' }, underline: true };
      });
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
