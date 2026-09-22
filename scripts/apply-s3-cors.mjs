import 'dotenv/config';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION;

if (!bucket || !region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Set AWS_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY first.');
  process.exit(1);
}

const corsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 's3-cors.json');
const cors = JSON.parse(await readFile(corsPath, 'utf8'));

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: cors,
    }),
  );
  console.log(`S3 CORS updated on ${bucket} for riversigns.co.uk`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
