import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="ink-wash flex min-h-[100dvh] items-center justify-center px-6">
      <div className="animate-in max-w-md text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-card shadow-sm">
          <FileQuestion size={28} className="text-accent" strokeWidth={1.7} />
        </div>
        <p className="mt-7 font-mono-app text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Desk note 404</p>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.04em] text-foreground">That page went missing.</h1>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">The document you are looking for is not on this desk. Return to the workspace and start a fresh conversion.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="link-return-workspace">
          <ArrowLeft size={16} />
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
