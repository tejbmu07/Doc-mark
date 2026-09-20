# DocMark deployment

DocMark is prepared for a split deployment:

- **Vercel** serves the React/Vite frontend and the installable PWA.
- A container-capable host runs the conversion API because it needs LibreOffice,
  Tesseract, Poppler, Antiword, and other native command-line tools.

## Deploy the frontend to Vercel

1. Import this repository as a new Vercel project.
2. Keep the Vercel project root at the repository root.
3. Keep the build settings from `vercel.json`.
4. Add this environment variable for the Production environment:

   ```text
   VITE_API_BASE_URL=https://your-conversion-api.example.com
   ```

   Use the API origin only. Do not append `/api`; the frontend adds that path
   when calling the conversion service.
5. Deploy.

The deployed site will expose the DocMark install option in browsers that
support PWA installation. Users can install it from Chrome or Edge on macOS
and Windows.

## Deploy the conversion API

The API must be reachable at:

```text
https://your-conversion-api.example.com/api/healthz
```

It needs a Linux environment where the document-conversion binaries are
installed. Keep CORS enabled for the Vercel domain. The current API accepts
the existing Markdown and PDF conversion requests without a frontend rewrite.

## Local development

Leave `VITE_API_BASE_URL` empty in `artifacts/docmark/.env.local` to use the
workspace `/api` route. Use the public API origin only for the Vercel build.