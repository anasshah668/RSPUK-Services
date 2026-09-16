import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const publicBase = String(process.env.S3_PUBLIC_BASE || '').replace(/\/+$/, '');

if (!region || !bucket || !accessKeyId || !secretAccessKey) {
  console.warn('⚠️  AWS S3 credentials not found in environment variables');
  console.warn('   Set AWS_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY');
} else {
  console.log(`✅ S3 configured (${bucket} / ${region})`);
}

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const storage = multer.memoryStorage();

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ARTWORK_ALLOWED_MIME = new Set([
  ...IMAGE_MIME,
  'application/pdf',
]);

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const mimeFromExtension = (ext) => {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
};

const sanitizeSegment = (value) =>
  String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

const extensionFrom = (originalName, mimetype) => {
  const fromName = path.extname(originalName || '').replace('.', '').toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return MIME_TO_EXT[mimetype] || 'bin';
};

const buildKey = (folder, originalName, mimetype) => {
  const prefix = sanitizeSegment(folder || 'printing-platform') || 'printing-platform';
  const ext = extensionFrom(originalName, mimetype);
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const base = sanitizeSegment(path.parse(originalName || 'file').name) || 'file';
  return `${prefix}/${unique}-${base}.${ext}`;
};

const publicUrlForKey = (key) => {
  if (publicBase) return `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
};

const assertS3Config = () => {
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 is not configured. Check AWS_REGION, S3_BUCKET, and AWS credentials.');
  }
};

const putObject = async ({ buffer, key, contentType }) => {
  assertS3Config();
  if (!buffer || buffer.length === 0) {
    throw new Error('File buffer is empty');
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }),
  );

  return {
    url: publicUrlForKey(key),
    publicId: key,
    key,
  };
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

export const artworkUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (ARTWORK_ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and PDF are allowed.'));
    }
  },
});

export const uploadToS3 = async (buffer, folder = 'printing-platform', options = {}) => {
  const originalName = options.originalName || 'image';
  const mimetype = options.mimetype || 'image/jpeg';
  const key = buildKey(folder, originalName, mimetype);
  const uploaded = await putObject({
    buffer,
    key,
    contentType: mimetype,
  });

  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
  };
};

export const uploadMultipleToS3 = async (files, folder = 'printing-platform') => {
  if (!Array.isArray(files)) return [];
  return Promise.all(
    files.map((file) =>
      uploadToS3(file.buffer, folder, {
        originalName: file.originalname,
        mimetype: file.mimetype,
      }),
    ),
  );
};

export const uploadArtworkToS3 = async (
  buffer,
  originalName,
  folder = 'printing-platform/artwork',
  mimetype = '',
) => {
  const ext = extensionFrom(originalName, mimetype);
  const contentType = mimetype || mimeFromExtension(ext);
  const key = buildKey(folder, originalName, contentType);
  const uploaded = await putObject({
    buffer,
    key,
    contentType,
  });

  const isPdf = contentType === 'application/pdf' || ext === 'pdf';

  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
    resourceType: isPdf ? 'raw' : 'image',
    format: ext,
    bytes: buffer?.length || 0,
    originalFilename: path.parse(originalName || 'file').name,
  };
};

/** Backward-compatible aliases used by existing routes. */
export const uploadToCloudinary = (buffer, folder = 'printing-platform') =>
  uploadToS3(buffer, folder);

export const uploadMultipleToCloudinary = (files, folder = 'printing-platform') =>
  uploadMultipleToS3(files, folder);

export const uploadArtworkToCloudinary = (buffer, originalName, folder = 'printing-platform/artwork') =>
  uploadArtworkToS3(buffer, originalName, folder);

export default s3;
