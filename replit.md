# DocMark

DocMark converts PDFs, Word documents, PowerPoint files, text files, and images into downloadable Markdown with native extraction and OCR fallback.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/docmark/src/pages/workspace.tsx` — primary conversion workspace and Markdown preview
- `artifacts/docmark/src/pages/settings.tsx` — local extraction and OCR preferences
- `artifacts/api-server/src/lib/document-converter.ts` — multipart parsing, native extraction, OCR, and Markdown formatting
- `artifacts/api-server/src/routes/convert.ts` — conversion API endpoint
- `lib/api-spec/openapi.yaml` — source of truth for the conversion API contract

## Architecture decisions

- Source files are processed in memory for the request and removed after conversion; no document library or file history is persisted.
- Native extraction is preferred for PDFs, DOC/DOCX, PPT/PPTX, and text files; Tesseract OCR handles images and scanned PDF pages.
- The browser receives Markdown as JSON so users can preview, copy, or download it without another storage service.

## Product

- Single-file drag-and-drop conversion
- Batch conversion for up to 20 files per request
- 25 MB maximum per file and 500 MB maximum combined file payload
- Structured or plain Markdown output
- OCR language selection
- Markdown preview/source view, copy, and download actions
- Local preferences for default extraction mode and OCR language

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- OCR language packs come from the local Tesseract installation; unsupported language codes return an explicit conversion error.
- The managed workflows provide `PORT` and `BASE_PATH`; standalone Vite builds need those environment variables set.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
