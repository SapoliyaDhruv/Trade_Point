require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');

const isVercel = process.env.VERCEL === '1';
const useBlobStorage = isVercel || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const uploadsRoot = path.join(process.cwd(), 'uploads');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const diskStorageFor = (folder) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsRoot, folder);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const buildMulter = (folder, maxFileSize) => {
  const storage = useBlobStorage ? multer.memoryStorage() : diskStorageFor(folder);
  return multer({
    storage,
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    }
  });
};

const normalizeLocalPath = (filePath) => {
  const relative = path.relative(process.cwd(), filePath);
  return relative.replace(/\\/g, '/');
};

const uploadToBlob = async (folder, file) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set. Configure it in your Vercel project.');
  }
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(file.originalname || '');
  const blobPath = `${folder}/${uniqueSuffix}${ext}`;
  const result = await put(blobPath, file.buffer, {
    access: 'public',
    contentType: file.mimetype
  });
  file.url = result.url;
  file.path = result.url;
  return result.url;
};

const prepareUploads = (folder) => async (req, res, next) => {
  try {
    if (useBlobStorage) {
      const files = [];
      if (req.file) files.push(req.file);
      if (req.files) {
        if (Array.isArray(req.files)) {
          files.push(...req.files);
        } else {
          Object.values(req.files).forEach((group) => {
            files.push(...group);
          });
        }
      }
      if (files.length) {
        await Promise.all(files.map((file) => uploadToBlob(folder, file)));
      }
    } else {
      if (req.file?.path) {
        req.file.path = normalizeLocalPath(req.file.path);
      }
      if (req.files) {
        const groups = Array.isArray(req.files) ? { files: req.files } : req.files;
        Object.values(groups).forEach((group) => {
          group.forEach((file) => {
            if (file?.path) {
              file.path = normalizeLocalPath(file.path);
            }
          });
        });
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  buildMulter,
  prepareUploads,
  useBlobStorage
};
