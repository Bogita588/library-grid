import "@tanstack/react-start/server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "./env.server";

let s3: S3Client | undefined;

function getS3() {
  if (!s3) {
    const env = getServerEnv();
    s3 = new S3Client({
      endpoint: env.s3Endpoint,
      region: env.s3Region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
      },
    });
  }
  return s3;
}

function bucket() {
  return getServerEnv().s3Bucket;
}

function contentDisposition(type: "inline" | "attachment", fileName: string) {
  const safeName = fileName.replaceAll('"', "'");
  return `${type}; filename="${safeName}"`;
}

export async function uploadObject({ key, file }: { key: string; file: File }) {
  await uploadBuffer({
    key,
    body: Buffer.from(await file.arrayBuffer()),
    contentLength: file.size,
    contentType: file.type || "application/octet-stream",
  });
}

export async function uploadBuffer({
  key,
  body,
  contentLength,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentLength: number;
  contentType: string;
}) {
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentLength: contentLength,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  await getS3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function readObject(key: string) {
  const result = await getS3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error("Document file body is empty");
  const bytes = await result.Body.transformToByteArray();
  return {
    bytes,
    contentType: result.ContentType ?? "application/octet-stream",
    contentLength: result.ContentLength ?? bytes.byteLength,
  };
}

export async function signedViewUrl(key: string, fileName: string) {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: contentDisposition("inline", fileName),
      ResponseContentType: "application/pdf",
    }),
    { expiresIn: 60 * 10 },
  );
}

export async function signedDownloadUrl(key: string, fileName: string) {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: contentDisposition("attachment", fileName),
    }),
    { expiresIn: 60 },
  );
}
