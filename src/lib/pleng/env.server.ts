import "@tanstack/react-start/server-only";

const requiredKeys = [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "JWT_SECRET",
] as const;

type RequiredKey = (typeof requiredKeys)[number];

function requireEnv(key: RequiredKey) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export function getServerEnv() {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    s3Endpoint: requireEnv("S3_ENDPOINT").replace(/\/+$/, ""),
    s3Region: process.env.S3_REGION?.trim() || "default",
    s3Bucket: requireEnv("S3_BUCKET"),
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    jwtSecret: requireEnv("JWT_SECRET"),
    companyAccessCode: process.env.COMPANY_ACCESS_CODE?.trim() || "",
    nodeEnv: process.env.NODE_ENV || "development",
  };
}
