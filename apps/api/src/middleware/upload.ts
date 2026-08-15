import multer from 'multer';
import { ApiError } from '../lib/http';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

/** Upload em memória para arquivos CSV/XLSX. */
export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().replace(/.*(\.[a-z0-9]+)$/i, '$1');
    const mimeOk = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype);
    if (ALLOWED_EXTENSIONS.includes(ext) || mimeOk) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Formato de arquivo não suportado. Use .csv ou .xlsx'));
    }
  },
});
