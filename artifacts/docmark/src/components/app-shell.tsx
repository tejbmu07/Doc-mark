import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <main className="min-h-[100dvh]">{children}</main>
    </div>
  );
}

export function ExternalHint() {
  return <ArrowUpRight size={14} />;
}