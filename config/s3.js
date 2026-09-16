import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const publicBase = String(process.env.S3_PUBLIC_BASE || '').replace(/\/+$/, '');

export const isS3Configured = Boolean(region && bucket && accessKeyId && secretAccessKey);

if (!isS3Configured) {
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
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const storage = multer.memoryStorage();

export const IMAGE_MIME = new Set([
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

export const keyFromStoredValue = (urlOrKey) => {
  const value = String(urlOrKey || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, '');
  }
  try {
    const parsed = new URL(value);
    const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (
      parsed.hostname === `${bucket}.s3.${region}.amazonaws.com` ||
      parsed.hostname.startsWith(`${bucket}.s3.`)
    ) {
      return pathname;
    }
    if (parsed.hostname.includes('amazonaws.com') && bucket && pathname.startsWith(`${bucket}/`)) {
      return pathname.slice(bucket.length + 1);
    }
    const mediaIdx = pathname.indexOf('api/media/');
    if (mediaIdx >= 0) return pathname.slice(mediaIdx + 'api/media/'.length);
    if (publicBase) {
      const baseHost = new URL(publicBase).hostname;
      if (parsed.hostname === baseHost && pathname) return pathname;
    }
  } catch {
    return '';
  }
  return '';
};

const isS3Stored = (url, publicId) => {
  const value = String(url || '');
  if (value.includes('cloudinary.com')) return false;
  if (value.includes('amazonaws.com') || value.includes('X-Amz-Algorithm')) return true;
  if (publicBase && value.startsWith(publicBase)) return true;
  if (value.includes('/api/media/')) return true;
  return String(publicId || '').startsWith('printing-platform/');
};

export const persistImageRecord = (img) => {
  if (typeof img === 'string') {
    img = { url: img };
  }
  const url = String(img?.url || '').trim();
  const publicId = String(img?.publicId || '').trim() || keyFromStoredValue(url);
  if (!url && !publicId) return null;
  if (isS3Stored(url, publicId)) {
    const key = keyFromStoredValue(url) || publicId;
    if (!key) return url ? { url, publicId } : null;
    return { publicId: key, url: publicUrlForKey(key) };
  }
  return { url, publicId };
};

export const signedReadUrl = async (key, expiresIn = 60 * 60 * 24 * 6) => {
  assertS3Config();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
};

export const withReadableUrl = async (img) => {
  const persisted = persistImageRecord(img);
  if (!persisted) return null;
  if (!isS3Stored(persisted.url, persisted.publicId)) return persisted;
  const key = persisted.publicId || keyFromStoredValue(persisted.url);
  if (!key) return persisted;
  try {
    return { ...persisted, url: await signedReadUrl(key) };
  } catch (error) {
    console.warn('[s3] Could not sign read URL:', error?.message || error);
    return persisted;
  }
};

export const withReadableUrls = async (images) => {
  const list = await Promise.all((Array.isArray(images) ? images : []).map(withReadableUrl));
  return list.filter(Boolean);
};

const assertS3Config = () => {
  if (!isS3Configured) {
    throw new Error(
      'S3 is not configured. Set AWS_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE on the server.',
    );
  }
};

const describeS3Error = (error) => {
  const status = error?.$metadata?.httpStatusCode;
  const code = error?.name || error?.Code || '';
  if (status === 403 || code === 'AccessDenied' || code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') {
    return 'S3 denied the upload. Check the AWS keys, bucket name, region, and PutObject permission.';
  }
  if (status === 404 || code === 'NoSuchBucket' || code === 'NotFound') {
    return 'S3 bucket was not found. Check S3_BUCKET and AWS_REGION.';
  }
  return error?.message || 'S3 upload failed';
};

const putObject = async ({ buffer, key, contentType }) => {
  assertS3Config();
  if (!buffer || buffer.length === 0) {
    throw new Error('File buffer is empty');
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        ContentLength: buffer.length,
      }),
    );
  } catch (error) {
    throw new Error(describeS3Error(error));
  }

  return {
    url: publicUrlForKey(key),
    publicId: key,
    key,
  };
};

let corsReady;
const ensureS3BrowserCors = async () => {
  if (corsReady) return corsReady;
  corsReady = (async () => {
    assertS3Config();
    try {
      await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
      return;
    } catch (err) {
      if (err?.name !== 'NoSuchCORSConfiguration' && err?.$metadata?.httpStatusCode !== 404) {
        console.warn('[s3] Could not read bucket CORS:', err?.message || err);
      }
    }
    try {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag', 'Location'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    } catch (err) {
      console.warn('[s3] Could not set bucket CORS for browser uploads:', err?.message || err);
    }
  })();
  return corsReady;
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
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

export const presignPutObject = async ({
  fileName,
  contentType,
  folder = 'printing-platform',
} = {}) => {
  assertS3Config();
  const type = String(contentType || '').trim().toLowerCase();
  if (!IMAGE_MIME.has(type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
  }
  await ensureS3BrowserCors();
  const key = buildKey(folder, fileName, type);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: type,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
  return {
    uploadUrl,
    key,
    publicId: key,
    publicUrl: publicUrlForKey(key),
    contentType: type,
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
