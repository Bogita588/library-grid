import "@tanstack/react-start/server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const pdfMimeType = "application/pdf";
const conversionTimeoutMs = Number(process.env.PDF_PREVIEW_TIMEOUT_MS) || 120_000;

const officeExtensions = new Set([
  ".doc",
  ".docx",
  ".dot",
  ".dotx",
  ".odt",
  ".rtf",
  ".xls",
  ".xlsx",
  ".ods",
  ".csv",
  ".ppt",
  ".pptx",
  ".odp",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
]);

const extensionByMime = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["application/vnd.oasis.opendocument.text", ".odt"],
  ["application/vnd.oasis.opendocument.spreadsheet", ".ods"],
  ["application/vnd.oasis.opendocument.presentation", ".odp"],
  ["text/plain", ".txt"],
  ["text/csv", ".csv"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

export type PdfPreview = {
  bytes: Buffer;
  fileName: string;
  mimeType: typeof pdfMimeType;
};

export function pdfPreviewFileName(fileName: string) {
  const parsed = path.parse(fileName);
  const base = parsed.name.trim() || "document";
  return `${base}.pdf`;
}

export function canCreatePdfPreview(fileName: string, mimeType: string | null | undefined) {
  const extension = fileExtension(fileName, mimeType);
  return extension === ".pdf" || officeExtensions.has(extension);
}

export async function createPdfPreview({
  bytes,
  fileName,
  mimeType,
}: {
  bytes: Buffer;
  fileName: string;
  mimeType: string | null | undefined;
}): Promise<PdfPreview | null> {
  if (!canCreatePdfPreview(fileName, mimeType)) return null;

  const extension = fileExtension(fileName, mimeType);
  const tmp = await mkdtemp(path.join(tmpdir(), "pleng-preview-"));

  try {
    const inputPath = path.join(tmp, `source${extension}`);
    const pdfPath =
      extension === ".pdf" ? inputPath : await convertWithLibreOffice(bytes, inputPath, tmp);

    if (extension === ".pdf") {
      await writeFile(inputPath, bytes);
    }

    const compressed = await compressPdf(pdfPath, tmp);
    return {
      bytes: compressed,
      fileName: pdfPreviewFileName(fileName),
      mimeType: pdfMimeType,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function fileExtension(fileName: string, mimeType: string | null | undefined) {
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName) return fromName;
  return extensionByMime.get((mimeType || "").toLowerCase()) ?? "";
}

async function convertWithLibreOffice(bytes: Buffer, inputPath: string, outDir: string) {
  await writeFile(inputPath, bytes);
  const profileDir = path.join(outDir, "lo-profile");
  const args = [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--nolockcheck",
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    inputPath,
  ];

  await runFirstAvailable(["libreoffice", "soffice"], args);

  const expectedPath = path.join(outDir, `${path.parse(inputPath).name}.pdf`);
  const entries = await readdir(outDir);
  const pdfName = entries.find((entry) => entry.toLowerCase().endsWith(".pdf"));
  return pdfName ? path.join(outDir, pdfName) : expectedPath;
}

async function compressPdf(inputPath: string, outDir: string) {
  const original = await readFile(inputPath);
  const outputPath = path.join(outDir, "compressed.pdf");

  try {
    await execFileAsync(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.6",
        "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: conversionTimeoutMs, maxBuffer: 1024 * 1024 * 4 },
    );
    const compressed = await readFile(outputPath);
    return compressed.byteLength < original.byteLength ? compressed : original;
  } catch {
    return original;
  }
}

async function runFirstAvailable(commands: string[], args: string[]) {
  let lastError: unknown;
  for (const command of commands) {
    try {
      await execFileAsync(command, args, {
        timeout: conversionTimeoutMs,
        maxBuffer: 1024 * 1024 * 4,
      });
      return;
    } catch (error) {
      lastError = error;
      if (isMissingCommand(error)) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LibreOffice is not installed");
}

function isMissingCommand(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
