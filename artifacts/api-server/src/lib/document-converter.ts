import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

export type SupportedSourceType = "pdf" | "docx" | "pptx" | "image" | "text";
export type ConversionTarget = "markdown" | "pdf";

export interface MultipartUpload {
  filename: string;
  contentType: string;
  buffer: Buffer;
  fields: Record<string, string>;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20;
const MAX_BATCH_BYTES = MAX_FILE_BYTES * MAX_FILES;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"]);

function headerValue(headers: string, name: string): string | undefined {
  const line = headers.split("\r\n").find((candidate) => candidate.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line?.slice(line.indexOf(":") + 1).trim();
}

function dispositionParameter(disposition: string, name: string): string | undefined {
  const match = disposition.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1];
}

export function parseMultipartBody(body: Buffer, contentType: string): { uploads: MultipartUpload[]; fields: Record<string, string> } {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new Error("The upload did not include a valid multipart boundary.");
  }

  const marker = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const uploads: MultipartUpload[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const start = body.indexOf(marker, cursor);
    if (start === -1) break;
    const partStart = start + marker.length;
    if (body.subarray(partStart, partStart + 2).toString() === "--") break;
    const contentStart = partStart + (body.subarray(partStart, partStart + 2).toString() === "\r\n" ? 2 : 0);
    const next = body.indexOf(marker, contentStart);
    if (next === -1) break;

    const part = body.subarray(contentStart, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      cursor = next;
      continue;
    }
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const partBody = part.subarray(headerEnd + 4, part.length - (part.subarray(part.length - 2).toString() === "\r\n" ? 2 : 0));
    const disposition = headerValue(headers, "content-disposition") ?? "";
    const name = dispositionParameter(disposition, "name");
    const filename = dispositionParameter(disposition, "filename");
    if (name && filename) {
      uploads.push({
        filename: filename || "document",
        contentType: headerValue(headers, "content-type") ?? "application/octet-stream",
        buffer: Buffer.from(partBody),
        fields,
      });
    } else if (name) {
      fields[name] = partBody.toString("utf8");
    }
    cursor = next;
  }

  if (uploads.length === 0) throw new Error("Choose at least one file before converting.");
  if (uploads.length > MAX_FILES) throw new Error("You can convert up to 20 files at once.");
  const totalBytes = uploads.reduce((sum, upload) => sum + upload.buffer.length, 0);
  if (totalBytes > MAX_BATCH_BYTES) throw new Error("The combined upload cannot exceed 500 MB.");
  for (const upload of uploads) {
    if (upload.buffer.length === 0) throw new Error(`${upload.filename} is empty.`);
    if (upload.buffer.length > MAX_FILE_BYTES) throw new Error(`${upload.filename} is larger than 25 MB.`);
  }
  return { uploads, fields };
}

function sourceTypeFor(filename: string): SupportedSourceType | undefined {
  const extension = extname(filename).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx" || extension === ".doc") return "docx";
  if (extension === ".pptx" || extension === ".ppt") return "pptx";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if ([".txt", ".md", ".csv", ".tsv", ".json", ".html", ".xml"].includes(extension)) return "text";
  return undefined;
}

function safeBaseName(filename: string): string {
  return (filename.split(/[\\/]/).pop() ?? filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function unzipFile(filePath: string, entry: string): Promise<string> {
  const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], { maxBuffer: 30 * 1024 * 1024 });
  return stdout;
}

async function extractDocx(filePath: string): Promise<string[]> {
  if (extname(filePath).toLowerCase() === ".doc") {
    const { stdout } = await execFileAsync("antiword", ["-f", filePath], { maxBuffer: 30 * 1024 * 1024 });
    return stdout.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }
  const xml = await unzipFile(filePath, "word/document.xml");
  const paragraphs = xml
    .split(/<\/w:p>/)
    .map((paragraph) => decodeXmlText((paragraph.match(/<w:p[\s\S]*?>([\s\S]*)/)?.[1] ?? "").replace(/<w:tab[^>]*\/>/g, "\t")))
    .filter(Boolean);
  return paragraphs;
}

async function extractPptx(filePath: string): Promise<string[]> {
  if (extname(filePath).toLowerCase() === ".ppt") {
    const { stdout: unicodeText } = await execFileAsync("strings", ["-el", filePath], { maxBuffer: 30 * 1024 * 1024 });
    const sections = unicodeText.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 1);
    if (sections.length > 0) return sections;
    const { stdout: asciiText } = await execFileAsync("strings", [filePath], { maxBuffer: 30 * 1024 * 1024 });
    return asciiText.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 1);
  }
  const { stdout } = await execFileAsync("unzip", ["-Z1", filePath], { maxBuffer: 2 * 1024 * 1024 });
  const entries = stdout
    .split("\n")
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
  const slides: string[] = [];
  for (const entry of entries) {
    const xml = await unzipFile(filePath, entry);
    const text = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlText(match[1])).filter(Boolean).join(" ");
    if (text) slides.push(text);
  }
  return slides;
}

async function runOcr(filePath: string, language: string): Promise<string> {
  const { stdout } = await execFileAsync("tesseract", [filePath, "stdout", "-l", language], { maxBuffer: 30 * 1024 * 1024 });
  return stdout.trim();
}

async function extractPdf(filePath: string, language: string, scratch: string): Promise<{ sections: string[]; usedOcr: boolean; pageCount?: number; warning?: string }> {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 30 * 1024 * 1024 });
  const nativeText = stdout.trim();
  const pageCount = Math.max(1, (nativeText.match(/\f/g)?.length ?? 0) + 1);
  if (nativeText) {
    return { sections: nativeText.split(/\f+/).map((section) => section.trim()).filter(Boolean), usedOcr: false, pageCount };
  }

  const prefix = join(scratch, "page");
  await execFileAsync("pdftoppm", ["-png", "-r", "160", "-f", "1", "-l", "20", filePath, prefix], { maxBuffer: 2 * 1024 * 1024 });
  const images = (await readdir(scratch)).filter((file) => file.startsWith("page-") && file.endsWith(".png")).sort();
  const sections: string[] = [];
  for (const image of images) {
    const text = await runOcr(join(scratch, image), language);
    if (text) sections.push(text);
  }
  return {
    sections,
    usedOcr: true,
    pageCount: images.length || undefined,
    warning: sections.length === 0 ? "No readable text was found in the scanned pages." : undefined,
  };
}

function makeMarkdown(filename: string, sourceType: SupportedSourceType, sections: string[], mode: "structured" | "plain"): string {
  const cleanSections = sections.map((section) => section.trim()).filter(Boolean);
  if (mode === "plain") return `${cleanSections.join("\n\n")}\n`;
  const title = filename.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() || "Converted document";
  const heading = title.charAt(0).toUpperCase() + title.slice(1);
  if (sourceType === "pptx") {
    return `# ${heading}\n\n${cleanSections.map((section, index) => `## Slide ${index + 1}\n\n${section}`).join("\n\n")}\n`;
  }
  if (sourceType === "pdf") {
    return `# ${heading}\n\n${cleanSections.map((section, index) => `## Page ${index + 1}\n\n${section}`).join("\n\n")}\n`;
  }
  return `# ${heading}\n\n${cleanSections.join("\n\n")}\n`;
}

export async function convertUpload(upload: MultipartUpload): Promise<{
  filename: string;
  markdown: string | null;
  sourceType: SupportedSourceType;
  usedOcr: boolean;
  characterCount: number | null;
  wordCount: number | null;
  pageCount?: number | null;
  warning?: string | null;
  outputBase64: string | null;
  outputMimeType: string | null;
  outputFilename: string | null;
}> {
  const sourceType = sourceTypeFor(upload.filename);
  if (!sourceType) throw new Error("That file type is not supported. Use PDF, DOCX, PPTX, TXT, Markdown, CSV, or an image.");
  if (upload.fields.target && upload.fields.target !== "markdown" && upload.fields.target !== "pdf") {
    throw new Error("Choose a supported conversion target.");
  }
  const target: ConversionTarget = upload.fields.target === "pdf" ? "pdf" : "markdown";
  if (target === "pdf" && sourceType !== "docx" && sourceType !== "pptx") {
    throw new Error("PDF export accepts Word and PowerPoint files only.");
  }
  const mode = upload.fields.mode === "plain" ? "plain" : "structured";
  const language = /^[a-z]{3}(?:\+[a-z]{3})?$/i.test(upload.fields.ocrLanguage ?? "") ? upload.fields.ocrLanguage : "eng";
  const scratch = await mkdtemp(join(tmpdir(), `docmark-${randomUUID()}-`));
  const filePath = join(scratch, upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_"));
  await writeFile(filePath, upload.buffer);

  try {
    if (target === "pdf") {
      await execFileAsync("libreoffice", [
        "--headless",
        "--convert-to", "pdf",
        "--outdir", scratch,
        filePath,
      ], { maxBuffer: 4 * 1024 * 1024 });
      const outputFilename = safeBaseName(upload.filename).replace(/\.[^/.]+$/, "") + ".pdf";
      const outputPath = join(scratch, outputFilename);
      const output = await readFile(outputPath);
      return {
        filename: upload.filename,
        markdown: null,
        sourceType,
        usedOcr: false,
        characterCount: null,
        wordCount: null,
        pageCount: null,
        warning: null,
        outputBase64: output.toString("base64"),
        outputMimeType: "application/pdf",
        outputFilename,
      };
    }

    let sections: string[] = [];
    let usedOcr = false;
    let pageCount: number | undefined;
    let warning: string | undefined;
    if (sourceType === "pdf") {
      const result = await extractPdf(filePath, language, scratch);
      sections = result.sections;
      usedOcr = result.usedOcr;
      pageCount = result.pageCount;
      warning = result.warning;
    } else if (sourceType === "docx") {
      sections = await extractDocx(filePath);
    } else if (sourceType === "pptx") {
      sections = await extractPptx(filePath);
      pageCount = sections.length || undefined;
    } else if (sourceType === "image") {
      sections = [await runOcr(filePath, language)];
      usedOcr = true;
    } else {
      sections = [upload.buffer.toString("utf8")];
    }

    const markdown = makeMarkdown(upload.filename, sourceType, sections, mode);
    const text = markdown.replace(/^#.*\n/, "").trim();
    return {
      filename: safeBaseName(upload.filename).replace(/\.[^/.]+$/, "") + ".md",
      markdown,
      sourceType,
      usedOcr,
      characterCount: markdown.length,
      wordCount: text ? text.split(/\s+/).length : 0,
      pageCount: pageCount ?? null,
      warning: warning ?? null,
      outputBase64: null,
      outputMimeType: "text/markdown",
      outputFilename: safeBaseName(upload.filename).replace(/\.[^/.]+$/, "") + ".md",
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}