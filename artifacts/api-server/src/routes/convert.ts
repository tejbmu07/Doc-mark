import { Router, type IRouter } from "express";
import { ConvertDocumentResponse } from "@workspace/api-zod";
import { convertUpload, parseMultipartBody } from "../lib/document-converter";

const router: IRouter = Router();

router.post("/convert", async (req, res): Promise<void> => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Upload a file using multipart form data." });
      return;
    }
    const contentType = req.header("content-type") ?? "";
    const { uploads, fields } = parseMultipartBody(req.body, contentType);
    const results = [];
    for (const upload of uploads) {
      try {
        const result = await convertUpload({ ...upload, fields });
        results.push({ ...result, status: "success", error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The document could not be converted.";
        req.log.warn({ filename: upload.filename, error: message }, "Document conversion failed");
        results.push({
          filename: upload.filename,
          status: "error",
          markdown: null,
          sourceType: null,
          usedOcr: false,
          characterCount: null,
          wordCount: null,
          pageCount: null,
          warning: null,
          error: message,
           outputBase64: null,
           outputMimeType: null,
           outputFilename: null,
        });
      }
    }
    res.json(ConvertDocumentResponse.parse({
      results,
      totalFiles: results.length,
      successCount: results.filter((result) => result.status === "success").length,
      failureCount: results.filter((result) => result.status === "error").length,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document could not be converted.";
    req.log.warn({ error: message }, "Document conversion failed");
    const status = /25 MB|500 MB|20 files|supported|choose|multipart|empty|boundary/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;