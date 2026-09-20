import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  FileCode2,
  FileOutput,
  FileText,
  FileUp,
  Languages,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  ScanText,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useConvertDocument, type ConversionItem } from '@workspace/api-client-react';
import Particles from '@/components/Particles';
import { InstallAppButton } from '@/components/install-app-button';

const MODE_KEY = 'docmark-default-mode';
const LANGUAGE_KEY = 'docmark-ocr-language';
const TARGET_KEY = 'docmark-default-target';

type ExtractionMode = 'structured' | 'plain';
type Target = 'markdown' | 'pdf';
type StudioResult = ConversionItem & {
  outputBase64?: string | null;
  outputMimeType?: string | null;
  outputFilename?: string | null;
};

const MARKDOWN_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'gif', 'txt', 'md', 'csv'];
const PDF_EXTENSIONS = ['doc', 'docx', 'ppt', 'pptx'];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;
const PARTICLE_COLORS = ['#171c4a', '#ef6548', '#6faaa5'];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(filename: string) {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function getFileTone(filename: string) {
  const extension = getExtension(filename);
  if (['doc', 'docx'].includes(extension)) return 'doc';
  if (['ppt', 'pptx'].includes(extension)) return 'slides';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'gif'].includes(extension)) return 'image';
  return 'text';
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The conversion could not be completed. Check the source and try again.';
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function extensionLabel(filename: string) {
  return getExtension(filename).toUpperCase() || 'FILE';
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const content = encoder.encode(entry.content);
    const crc = crc32(content);
    const localHeader = new ArrayBuffer(30 + name.length);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    new Uint8Array(localHeader, 30).set(name);
    localParts.push(new Uint8Array(localHeader), content);

    const centralHeader = new ArrayBuffer(46 + name.length);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(name);
    centralParts.push(new Uint8Array(centralHeader));
    offset += localHeader.byteLength + content.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const parts = [...localParts, ...centralParts, new Uint8Array(end)];
  const archive = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

export default function Workspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<ExtractionMode>('structured');
  const [target, setTarget] = useState<Target>('markdown');
  const [language, setLanguage] = useState('eng');
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<StudioResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<'preview' | 'source'>('preview');
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const convert = useConvertDocument();

  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY);
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    const storedTarget = localStorage.getItem(TARGET_KEY);
    if (storedMode === 'structured' || storedMode === 'plain') setMode(storedMode);
    if (storedLanguage) setLanguage(storedLanguage);
    if (storedTarget === 'markdown' || storedTarget === 'pdf') setTarget(storedTarget);
  }, []);

  useEffect(() => {
    if (!convert.isPending) {
      setProgress(0);
      return;
    }
    setProgress(10);
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(value + Math.max(2, (92 - value) / 8), 92));
    }, 450);
    return () => window.clearInterval(timer);
  }, [convert.isPending]);

  function chooseTarget(nextTarget: Target) {
    setTarget(nextTarget);
    localStorage.setItem(TARGET_KEY, nextTarget);
    setFileError(null);
    setFiles([]);
    setResults([]);
    setSelectedIndex(0);
    convert.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  function chooseFiles(nextFiles?: FileList | File[]) {
    if (!nextFiles) return;
    const selected = [...files, ...Array.from(nextFiles)];
    const allowed = target === 'pdf' ? PDF_EXTENSIONS : MARKDOWN_EXTENSIONS;
    const invalidType = selected.filter((candidate) => !allowed.includes(getExtension(candidate.name)));
    const oversized = selected.filter((candidate) => candidate.size > MAX_FILE_BYTES);
    const valid = selected.filter((candidate) => allowed.includes(getExtension(candidate.name)) && candidate.size <= MAX_FILE_BYTES);
    let message: string | null = invalidType.length > 0
      ? target === 'pdf'
        ? 'PDF export accepts Word and PowerPoint files only.'
        : 'One or more files are not supported by this workspace.'
      : null;
    if (oversized.length > 0) message = `${oversized[0].name} is larger than 25 MB.`;
    if (valid.reduce((sum, candidate) => sum + candidate.size, 0) > MAX_BATCH_BYTES) message = 'The combined upload cannot exceed 500 MB.';
    if (valid.length > 20) {
      message = 'Choose up to 20 files at once. The first 20 are ready below.';
    }
    setFileError(message);
    setFiles(valid.slice(0, 20));
    setResults([]);
    setSelectedIndex(0);
    setCopied(false);
    convert.reset();
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setResults([]);
    setSelectedIndex(0);
    setCopied(false);
    convert.reset();
  }

  function submitConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0 || convert.isPending) return;
    const requestData = {
      file: files,
      mode,
      ocrLanguage: language,
      target,
    } as unknown as Parameters<typeof convert.mutate>[0]['data'];
    convert.mutate({ data: requestData }, {
      onSuccess: (data) => {
        setResults(data.results as StudioResult[]);
        setSelectedIndex(0);
        setProgress(100);
        setPreview('preview');
      },
    });
  }

  function downloadResult() {
    const result = results[selectedIndex];
    if (!result) return;
    if (target === 'markdown' && result.markdown) {
      const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.outputFilename ?? `${result.filename.replace(/\.[^/.]+$/, '')}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (target === 'pdf' && result.outputBase64) {
      const blob = base64ToBlob(result.outputBase64, result.outputMimeType ?? 'application/pdf');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.outputFilename ?? `${result.filename.replace(/\.[^/.]+$/, '')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }

  function downloadBundle() {
    const successful = results.filter((item): item is StudioResult & { markdown: string } => item.status === 'success' && Boolean(item.markdown));
    if (successful.length < 2) return;
    const usedNames = new Set<string>();
    const entries = successful.map((item) => {
      const baseName = item.outputFilename ?? item.filename.replace(/\.[^/.]+$/, '') + '.md';
      const extension = baseName.toLowerCase().endsWith('.md') ? '' : '.md';
      const stem = baseName.replace(/\.md$/i, '');
      let name = `${stem}${extension}`;
      let suffix = 2;
      while (usedNames.has(name)) name = `${stem}-${suffix++}${extension}`;
      usedNames.add(name);
      return { name, content: item.markdown };
    });
    const blob = new Blob([createZip(entries)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `docmark-markdown-${entries.length}-files.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyMarkdown() {
    const result = results[selectedIndex];
    if (!result?.markdown) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function clearDesk() {
    setFiles([]);
    setResults([]);
    setSelectedIndex(0);
    setFileError(null);
    setCopied(false);
    setProgress(0);
    convert.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  const result = results[selectedIndex];
  const successCount = results.filter((item) => item.status === 'success').length;
  const canSubmit = files.length > 0 && !convert.isPending;
  const canDownload = Boolean(result && (target === 'markdown' ? result.markdown : result.outputBase64));
  const canDownloadBundle = target === 'markdown' && successCount > 1;
  const acceptedExtensions = target === 'pdf' ? '.doc,.docx,.ppt,.pptx' : '.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.gif,.txt,.md,.csv';
  const enterTransition = reducedMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 0.8, 0.25, 1] as const };

  return (
    <div className="ink-wash grain min-h-[100dvh] px-4 py-5 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-[1380px]">
        <header className="animate-in flex items-center justify-between border-b border-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <FileOutput size={18} strokeWidth={1.8} />
            </div>
            <div>
              <p className="font-mono-app text-[10px] font-medium uppercase tracking-[0.22em] text-foreground">DocMark</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">A small workshop for useful files</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallAppButton />
            <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 font-mono-app text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:flex">
              <LockKeyhole size={11} className="text-accent" />
              Files are handled per request
            </div>
          </div>
        </header>

        <section className="animate-in animate-in-delay-1 relative overflow-hidden pb-9 pt-10 sm:pb-12 sm:pt-14">
          {!reducedMotion && <div className="pointer-events-none absolute inset-0 opacity-55" aria-hidden="true">
            <Particles
              particleCount={190}
              particleSpread={12}
              speed={0.075}
              particleColors={PARTICLE_COLORS}
              moveParticlesOnHover
              particleHoverFactor={0.3}
              alphaParticles
              particleBaseSize={78}
              sizeRandomness={0.7}
              cameraDistance={21}
            />
          </div>}
          <div className="pointer-events-none absolute -right-12 -top-20 hidden size-72 rounded-full border border-accent/20 sm:block" />
          <div className="pointer-events-none absolute right-12 top-5 hidden size-44 rounded-full border border-accent/15 sm:block" />
          <div className="relative max-w-3xl">
            <p className="font-mono-app text-[10px] uppercase tracking-[0.24em] text-accent">Document workshop / 01</p>
            <h1 className="mt-4 max-w-3xl font-display text-[3.15rem] leading-[0.91] tracking-[-0.065em] text-foreground sm:text-[5.5rem]">
              Take it from source<br className="hidden sm:block" /> to somewhere useful.
            </h1>
            <div className="mt-6 flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Extract a clean Markdown draft from everyday documents, or turn a deck or Word file into a ready-to-share PDF. No filing cabinet. Just the next format.
              </p>
              <p className="shrink-0 font-mono-app text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Native text + OCR</p>
            </div>
          </div>
        </section>

        <section className="animate-in animate-in-delay-2 mb-6">
          <div className="grid gap-2 rounded-2xl border border-border bg-card/70 p-2 shadow-sm sm:grid-cols-2">
            <TargetCard
              active={target === 'markdown'}
              icon={<FileCode2 size={19} />}
              eyebrow="Read and reuse"
              title="Extract Markdown"
              description="Headings, lists, tables, and clean text from PDFs, office files, scans, and images."
              onClick={() => chooseTarget('markdown')}
              testId="button-target-markdown"
              reducedMotion={reducedMotion}
            />
            <TargetCard
              active={target === 'pdf'}
              icon={<FileOutput size={19} />}
              eyebrow="Package and share"
              title="Export to PDF"
              description="Give Word documents and presentations a dependable, portable finish."
              onClick={() => chooseTarget('pdf')}
              testId="button-target-pdf"
              reducedMotion={reducedMotion}
            />
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(330px,0.78fr)_minmax(0,1.22fr)]">
          <section className="animate-in animate-in-delay-2">
            <form onSubmit={submitConversion} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-30px_hsl(var(--primary)/.35)]">
              <div className="border-b border-border bg-primary px-5 py-5 text-primary-foreground sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono-app text-[10px] uppercase tracking-[0.19em] text-primary-foreground/60">Your workbench</p>
                    <h2 className="mt-2 font-display text-2xl tracking-[-0.035em]">Place the source.</h2>
                  </div>
                  <span className="rounded-full border border-primary-foreground/20 px-2.5 py-1 font-mono-app text-[9px] uppercase tracking-[0.12em] text-primary-foreground/65">
                    {target === 'markdown' ? 'to .md' : 'to .pdf'}
                  </span>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <input ref={inputRef} type="file" multiple accept={acceptedExtensions} className="hidden" onChange={(event) => chooseFiles(event.target.files ?? undefined)} data-testid="input-file" />
                {files.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFiles(event.dataTransfer.files); }}
                    className={`paper-grid group flex min-h-[238px] w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-[background-color,border-color,transform] ${isDragging ? 'scale-[1.01] border-accent bg-accent/10' : 'border-input bg-background/30 hover:border-accent/65 hover:bg-accent/[0.045]'}`}
                    data-testid="button-upload-file"
                  >
                    <span className="relative grid size-14 place-items-center rounded-[20px] bg-secondary text-primary transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-2">
                      <UploadCloud size={23} strokeWidth={1.7} />
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-accent-foreground"><Plus size={12} strokeWidth={2.5} /></span>
                    </span>
                    <span className="mt-5 text-sm font-semibold text-foreground">{isDragging ? 'Release to place the source' : 'Drop files onto the desk'}</span>
                    <span className="mt-1 text-xs text-muted-foreground">or choose them from your device</span>
                    <span className="mt-5 font-mono-app text-[9px] uppercase tracking-[0.14em] text-muted-foreground/75">
                      {target === 'markdown' ? 'PDF · DOCX · PPTX · IMAGE · TEXT' : 'DOC · DOCX · PPT · PPTX'}
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-accent/35 bg-accent/[0.055] p-4" data-testid="card-selected-files">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-accent" />
                          <p className="text-sm font-semibold text-foreground" data-testid="text-selected-file-count">{files.length} {files.length === 1 ? 'source' : 'sources'} ready</p>
                        </div>
                        <p className="mt-1 pl-6 font-mono-app text-[9px] uppercase tracking-[0.1em] text-muted-foreground">20 files · 25 MB each</p>
                      </div>
                      <button type="button" onClick={clearDesk} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground" aria-label="Clear selected files" data-testid="button-clear-files"><X size={16} /></button>
                    </div>
                    <div className="mt-4 max-h-44 space-y-1.5 overflow-auto pr-1">
                      {files.map((candidate, index) => (
                        <FileRow key={`${candidate.name}-${candidate.lastModified}-${index}`} file={candidate} index={index} onRemove={() => removeFile(index)} />
                      ))}
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-accent transition-colors hover:text-foreground" data-testid="button-add-files"><FileUp size={14} /> Add more files</button>
                    {fileError && <p className="mt-3 text-xs leading-5 text-destructive" role="alert" data-testid="status-file-error">{fileError}</p>}
                  </div>
                )}
                {fileError && files.length === 0 && <p className="mt-3 text-xs leading-5 text-destructive" role="alert" data-testid="status-file-error-empty">{fileError}</p>}

                <div className="mt-7 border-t border-border/80 pt-6">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono-app text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Finishing preference</p>
                      <h2 className="mt-1 text-sm font-semibold text-foreground">{target === 'markdown' ? 'Shape the reading flow' : 'Keep the page intact'}</h2>
                    </div>
                    <span className="font-mono-app text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Saved locally</span>
                  </div>
                  {target === 'markdown' ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <ChoiceButton active={mode === 'structured'} onClick={() => { setMode('structured'); localStorage.setItem(MODE_KEY, 'structured'); }} title="Structured" description="Headings, lists, tables" testId="button-extraction-structured" />
                      <ChoiceButton active={mode === 'plain'} onClick={() => { setMode('plain'); localStorage.setItem(MODE_KEY, 'plain'); }} title="Plain" description="Clean reading flow" testId="button-extraction-plain" />
                    </div>
                  ) : (
                    <div className="mt-3 flex items-start gap-3 rounded-xl border border-secondary bg-secondary/45 p-3.5">
                      <FileText size={17} className="mt-0.5 shrink-0 text-primary" />
                      <p className="text-xs leading-5 text-muted-foreground">Original page order and visual hierarchy are sent through the PDF export pipeline.</p>
                    </div>
                  )}
                </div>

                {target === 'markdown' && (
                  <label className="mt-5 block">
                    <span className="flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[0.17em] text-muted-foreground"><Languages size={12} /> OCR language</span>
                    <select value={language} onChange={(event) => { setLanguage(event.target.value); localStorage.setItem(LANGUAGE_KEY, event.target.value); }} className="mt-2 h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30" data-testid="select-workspace-language">
                      <option value="eng">English</option>
                      <option value="fra">French</option>
                      <option value="deu">German</option>
                      <option value="spa">Spanish</option>
                      <option value="ita">Italian</option>
                      <option value="por">Portuguese</option>
                      <option value="jpn">Japanese</option>
                      <option value="chi_sim">Chinese (Simplified)</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="border-t border-border bg-muted/35 p-5 sm:p-6">
                <AnimatePresence initial={false}>
                  {convert.isError && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mb-4 flex gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3.5 text-sm text-destructive" role="alert" data-testid="status-conversion-error">
                      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                      <div><p className="font-semibold">The desk paused.</p><p className="mt-0.5 text-xs leading-5">{getErrorMessage(convert.error)}</p></div>
                    </motion.div>
                  )}
                  {convert.isPending && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mb-4" data-testid="status-conversion-progress">
                      <div className="mb-2 flex items-center justify-between font-mono-app text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <span className="flex items-center gap-2"><LoaderCircle size={13} className="animate-spin text-accent" /> {target === 'markdown' ? 'Reading the source' : 'Preparing the PDF'}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="progress-sheen h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button type="submit" disabled={!canSubmit} whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={reducedMotion ? undefined : { y: 0 }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-[0_8px_20px_-10px_hsl(var(--accent)/.7)] transition-[box-shadow,opacity] hover:shadow-[0_12px_24px_-10px_hsl(var(--accent)/.85)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-none" data-testid="button-convert">
                  {convert.isPending ? <><LoaderCircle size={16} className="animate-spin" /> Working on it</> : <><Sparkles size={16} /> {target === 'markdown' ? 'Extract Markdown' : 'Export PDF'} <ArrowRight size={15} /></>}
                </motion.button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-4 text-muted-foreground"><LockKeyhole size={11} /> No source library. One request, one result.</p>
              </div>
            </form>
          </section>

          <section className="animate-in animate-in-delay-3 min-w-0">
            <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-32px_hsl(var(--primary)/.38)]">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono-app text-[10px] uppercase tracking-[0.18em] text-muted-foreground">The landing page</p>
                  <h2 className="mt-1 text-sm font-semibold text-foreground">{target === 'markdown' ? 'Read the result' : 'Collect the PDF'}</h2>
                </div>
                <div className="flex items-center gap-2 font-mono-app text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className={`size-2 rounded-full ${convert.isPending ? 'animate-pulse bg-accent' : result ? 'bg-secondary-foreground' : 'bg-border'}`} />
                  <span data-testid="text-workspace-status">{convert.isPending ? 'Working' : result ? 'Ready to take' : 'Waiting for source'}</span>
                </div>
              </div>
              {results.length > 0 && (
                <div className="border-b border-border px-5 py-3 sm:px-6">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {results.map((item, index) => (
                      <button key={`${item.filename}-${index}`} type="button" onClick={() => { setSelectedIndex(index); setPreview('preview'); setCopied(false); }} className={`flex max-w-[230px] shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition-[background-color,border-color,color] ${selectedIndex === index ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/55 text-muted-foreground hover:bg-muted hover:text-foreground'}`} title={item.filename} data-testid={`button-result-${index}`}>
                        {item.status === 'success' ? <Check size={13} className={selectedIndex === index ? 'text-accent' : 'text-secondary-foreground'} /> : <AlertTriangle size={13} className="text-destructive" />}
                        <span className="truncate">{item.filename}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-app text-[9px] uppercase tracking-[0.12em] text-muted-foreground" data-testid="text-conversion-count">{successCount} of {results.length} {target === 'markdown' ? 'sources extracted' : 'files exported'}</p>
                </div>
              )}
              <AnimatePresence mode="wait" initial={false}>
                {convert.isPending ? (
                  <motion.div key="converting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="paper-grid flex flex-1 flex-col items-center justify-center px-8 text-center" data-testid="state-converting">
                    <div className="relative grid size-20 place-items-center rounded-[26px] border border-accent/35 bg-accent/[0.08] text-accent">
                      <LoaderCircle size={30} strokeWidth={1.5} className="animate-spin" />
                      <span className="absolute inset-x-0 -bottom-7 font-mono-app text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Making sense of it</span>
                    </div>
                    <h3 className="mt-12 font-display text-2xl tracking-[-0.035em] text-foreground">A careful pass is underway.</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">We are reading each source in order and keeping the useful structure intact.</p>
                  </motion.div>
                ) : result?.status === 'success' ? (
                  <motion.div key={`success-${selectedIndex}`} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={enterTransition} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-5 py-3 sm:px-6" data-testid="card-conversion-summary">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><CheckCircle2 size={14} className="text-accent" /> {target === 'markdown' ? 'Extraction complete' : 'PDF ready'}</span>
                      {result.wordCount != null && <span className="font-mono-app text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{result.wordCount.toLocaleString()} words</span>}
                      {result.characterCount != null && <span className="font-mono-app text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{result.characterCount.toLocaleString()} chars</span>}
                      {result.pageCount != null && <span className="font-mono-app text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{result.pageCount} pages</span>}
                      {result.usedOcr && <span className="flex items-center gap-1 font-mono-app text-[10px] uppercase tracking-[0.08em] text-accent"><ScanText size={12} /> OCR used</span>}
                      {results.length > 1 && successCount < results.length && <span className="font-mono-app text-[10px] uppercase tracking-[0.08em] text-destructive">{results.length - successCount} needs review</span>}
                    </div>
                    {result.warning && <div className="flex gap-2 border-b border-border bg-accent/[0.07] px-5 py-3 text-xs leading-5 text-foreground sm:px-6"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent" />{result.warning}</div>}
                    {target === 'markdown' ? (
                      <>
                        <div className="flex items-center justify-between border-b border-border px-5 py-2.5 sm:px-6">
                          <span className="font-mono-app text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{extensionLabel(result.filename)} → MARKDOWN</span>
                          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1">
                            <button type="button" onClick={() => setPreview('preview')} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${preview === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid="button-preview-markdown">Preview</button>
                            <button type="button" onClick={() => setPreview('source')} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${preview === 'source' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid="button-source-markdown">Markdown</button>
                          </div>
                        </div>
                        <div className={`min-h-0 flex-1 overflow-auto p-5 sm:p-7 ${preview === 'preview' ? 'prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-[-0.03em] prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground' : ''}`} data-testid="content-conversion-result">
                          {preview === 'source' ? <pre className="whitespace-pre-wrap font-mono-app text-xs leading-6 text-foreground/80">{result.markdown ?? ''}</pre> : <MarkdownPreview markdown={result.markdown ?? ''} />}
                        </div>
                      </>
                    ) : (
                      <div className="paper-grid flex flex-1 flex-col items-center justify-center px-8 text-center" data-testid="content-pdf-result">
                        <div className="relative grid size-24 place-items-center rounded-[30px] border border-accent/30 bg-accent/[0.08] text-accent">
                          <FileOutput size={37} strokeWidth={1.35} />
                          <span className="absolute -right-3 -top-3 rounded-lg bg-primary px-2 py-1 font-mono-app text-[9px] font-medium tracking-[0.12em] text-primary-foreground">PDF</span>
                        </div>
                        <h3 className="mt-7 max-w-md font-display text-3xl leading-none tracking-[-0.045em] text-foreground">Your portable version is ready.</h3>
                        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">The export is packaged and waiting below. Keep the original page order, lose the format friction.</p>
                        <p className="mt-5 rounded-full border border-border bg-card/75 px-3 py-1.5 font-mono-app text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{result.outputFilename ?? `${result.filename.replace(/\.[^/.]+$/, '')}.pdf`}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/35 px-5 py-4 sm:px-6">
                      {target === 'markdown' ? (
                        <button type="button" onClick={copyMarkdown} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted" data-testid="button-copy-markdown">{copied ? <Check size={14} className="text-accent" /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy Markdown'}</button>
                      ) : (
                        <span className="flex items-center gap-2 text-[11px] text-muted-foreground"><CheckCircle2 size={14} className="text-accent" /> Export checked and ready</span>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={clearDesk} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" data-testid="button-new-conversion"><RotateCcw size={14} /> Start again</button>
                        {canDownloadBundle && <motion.button type="button" onClick={downloadBundle} whileHover={reducedMotion ? undefined : { y: -2 }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-[box-shadow,background-color] hover:bg-muted hover:shadow-md" data-testid="button-download-bundle"><Archive size={14} /> Download {successCount} as ZIP</motion.button>}
                        <motion.button type="button" disabled={!canDownload} onClick={downloadResult} whileHover={reducedMotion ? undefined : { y: -2 }} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground shadow-sm transition-[box-shadow,opacity] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-download-result"><ArrowDownToLine size={14} /> Download {target === 'markdown' ? '.md' : '.pdf'}</motion.button>
                      </div>
                    </div>
                  </motion.div>
                ) : result?.status === 'error' ? (
                  <motion.div key={`error-${selectedIndex}`} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={enterTransition} className="flex flex-1 flex-col items-center justify-center px-8 text-center" data-testid="state-result-error">
                    <div className="grid size-16 place-items-center rounded-2xl border border-destructive/20 bg-destructive/[0.06] text-destructive"><AlertTriangle size={25} /></div>
                    <h3 className="mt-5 font-display text-2xl tracking-[-0.03em] text-foreground">This source needs attention.</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{result.error ?? 'The file could not be converted.'}</p>
                    <p className="mt-4 font-mono-app text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{result.filename}</p>
                     <button type="button" onClick={() => { const fileIndex = files.findIndex((file) => file.name === result.filename); if (fileIndex >= 0) removeFile(fileIndex); }} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted" data-testid="button-remove-failed-file"><X size={14} /> Remove source</button>
                  </motion.div>
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="paper-grid flex flex-1 flex-col items-center justify-center px-8 text-center" data-testid="state-empty">
                    <div className="relative grid size-20 place-items-center rounded-[26px] border border-border bg-background/75 shadow-sm">
                      <FileCode2 size={29} className="text-muted-foreground/70" strokeWidth={1.3} />
                      <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground shadow-sm"><ScanText size={14} /></span>
                    </div>
                    <h3 className="mt-6 font-display text-2xl tracking-[-0.03em] text-foreground">{files.length > 0 ? 'The next format lands here.' : 'A useful file starts here.'}</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{files.length > 0 ? `Run the ${target === 'markdown' ? 'extraction' : 'export'} when the source is ready. Your result will appear here to inspect and take away.` : 'Place one or more sources on the desk. DocMark keeps the workflow short, legible, and out of the way.'}</p>
                    <div className="mt-7 flex flex-wrap justify-center gap-2 font-mono-app text-[9px] uppercase tracking-[0.12em] text-muted-foreground/75">
                      <span className="rounded-full border border-border bg-background/55 px-3 py-1.5">Native pipeline</span>
                      <span className="rounded-full border border-border bg-background/55 px-3 py-1.5">{target === 'markdown' ? 'OCR fallback' : 'Portable output'}</span>
                      <span className="rounded-full border border-border bg-background/55 px-3 py-1.5">Ready to take</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>

        <footer className="mt-7 flex flex-col gap-2 border-t border-border/70 pt-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>For the quiet work of making information usable.</span>
          <span className="font-mono-app tracking-[0.08em]">PDF / DOCX / PPTX / IMAGE → {target === 'markdown' ? 'MD' : 'PDF'}</span>
        </footer>
      </div>
    </div>
  );
}

function TargetCard({
  active,
  icon,
  eyebrow,
  title,
  description,
  onClick,
  testId,
  reducedMotion,
}: {
  active: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
  reducedMotion: boolean | null;
}) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={reducedMotion ? undefined : { y: -1 }} whileTap={reducedMotion ? undefined : { scale: 0.995 }} className={`group relative overflow-hidden rounded-xl border px-4 py-4 text-left transition-[background-color,border-color,box-shadow] ${active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-transparent bg-background/30 text-foreground hover:border-border hover:bg-background/65'}`} data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${active ? 'bg-accent text-accent-foreground' : 'bg-secondary text-primary group-hover:bg-accent group-hover:text-accent-foreground'}`}>{icon}</span>
        <span className="min-w-0">
          <span className={`block font-mono-app text-[9px] uppercase tracking-[0.15em] ${active ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{eyebrow}</span>
          <span className="mt-1 block text-sm font-semibold">{title}</span>
        </span>
        {active && <Check size={16} className="ml-auto shrink-0 text-accent" />}
      </div>
      <p className={`mt-3 pl-12 text-xs leading-5 ${active ? 'text-primary-foreground/68' : 'text-muted-foreground'}`}>{description}</p>
    </motion.button>
  );
}

function ChoiceButton({ active, onClick, title, description, testId }: { active: boolean; onClick: () => void; title: string; description: string; testId: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] ${active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background/45 text-foreground hover:bg-muted'}`} data-testid={testId}>
      <span className="flex items-center justify-between text-xs font-semibold">{title}{active && <Check size={13} className="text-accent" />}</span>
      <span className={`mt-1 block text-[10px] leading-4 ${active ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{description}</span>
    </button>
  );
}

function FileRow({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const tone = getFileTone(file.name);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/75 px-2.5 py-2.5" data-testid={`row-selected-file-${index}`}>
      <span className={`grid size-7 shrink-0 place-items-center rounded-md text-[8px] font-semibold tracking-[0.05em] ${tone === 'image' ? 'bg-secondary text-secondary-foreground' : tone === 'slides' ? 'bg-accent/15 text-accent' : tone === 'pdf' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
        {tone === 'image' ? <ScanText size={13} /> : <FileText size={13} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{file.name}</span>
      <span className="shrink-0 font-mono-app text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{formatBytes(file.size)}</span>
      <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`Remove ${file.name}`} data-testid={`button-remove-file-${index}`}><X size={13} /></button>
    </div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).filter(Boolean);
  if (blocks.length === 0) return <p className="text-sm text-muted-foreground">The source did not return readable text.</p>;
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const first = lines[0];
        if (first.startsWith('#')) {
          const level = Math.min(first.match(/^#+/)?.[0].length ?? 1, 3);
          const text = first.replace(/^#+\s*/, '');
          const Heading = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
          return <Heading key={index} className="font-display text-2xl leading-tight tracking-[-0.03em]">{text}</Heading>;
        }
        if (lines.every((line) => /^[-*]\s/.test(line))) {
          return <ul key={index} className="list-disc space-y-1 pl-5 text-sm leading-6">{lines.map((line, lineIndex) => <li key={`${index}-${lineIndex}`}>{line.replace(/^[-*]\s/, '')}</li>)}</ul>;
        }
        if (/^\d+\.\s/.test(first)) {
          return <ol key={index} className="list-decimal space-y-1 pl-5 text-sm leading-6">{lines.map((line, lineIndex) => <li key={`${index}-${lineIndex}`}>{line.replace(/^\d+\.\s*/, '')}</li>)}</ol>;
        }
        return <p key={index} className="text-sm leading-7 text-muted-foreground">{block}</p>;
      })}
    </div>
  );
}