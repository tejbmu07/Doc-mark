import { useEffect, useState } from 'react';
import { Check, Languages, Save, Settings2 } from 'lucide-react';
import { Link } from 'wouter';

const MODE_KEY = 'docmark-default-mode';
const LANGUAGE_KEY = 'docmark-ocr-language';

export default function SettingsPage() {
  const [mode, setMode] = useState<'structured' | 'plain'>('structured');
  const [language, setLanguage] = useState('eng');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY);
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    if (storedMode === 'structured' || storedMode === 'plain') setMode(storedMode);
    if (storedLanguage) setLanguage(storedLanguage);
  }, []);

  function savePreferences() {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(LANGUAGE_KEY, language);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="ink-wash min-h-[100dvh] px-5 py-7 sm:px-8 sm:py-10 lg:px-14 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="animate-in flex items-start justify-between gap-5">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[0.2em] text-accent">Preferences / 02</p>
            <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] text-foreground sm:text-5xl">Set the desk once.</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">DocMark will remember these choices on this device, so routine conversions stay one click away.</p>
          </div>
          <Link href="/" className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex" data-testid="link-settings-done">Done</Link>
        </div>

        <div className="animate-in animate-in-delay-1 mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <section className="p-5 sm:p-7">
            <div className="flex gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Settings2 size={18} /></div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">Default extraction mode</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Structured keeps headings, lists, tables, and document hierarchy. Plain is best for clean paragraphs.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'structured' as const, title: 'Structured Markdown', note: 'Preserve document shape' },
                    { value: 'plain' as const, title: 'Plain Markdown', note: 'Keep the reading flow' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMode(option.value)}
                      className={`group rounded-xl border p-4 text-left transition-all ${mode === option.value ? 'border-accent bg-accent/8 shadow-[0_0_0_3px_hsl(var(--accent)/.1)]' : 'border-border bg-background/45 hover:border-foreground/25 hover:bg-muted/50'}`}
                      data-testid={`button-mode-${option.value}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground">{option.title}</span>
                        <span className={`grid size-5 place-items-center rounded-full border ${mode === option.value ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-transparent'}`}><Check size={12} strokeWidth={3} /></span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{option.note}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="p-5 sm:p-7">
            <div className="flex gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Languages size={18} /></div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">OCR language</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Used when a scan or image needs optical character recognition. You can change this before any conversion.</p>
                <label className="mt-5 block max-w-sm">
                  <span className="mb-2 block font-mono-app text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Primary language</span>
                  <select value={language} onChange={(event) => setLanguage(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30" data-testid="select-ocr-language">
                    <option value="eng">English</option>
                    <option value="fra">French</option>
                    <option value="deu">German</option>
                    <option value="spa">Spanish</option>
                    <option value="ita">Italian</option>
                    <option value="por">Portuguese</option>
                    <option value="nld">Dutch</option>
                    <option value="jpn">Japanese</option>
                    <option value="kor">Korean</option>
                    <option value="chi_sim">Chinese (Simplified)</option>
                  </select>
                </label>
              </div>
            </div>
          </section>
          <div className="flex items-center justify-between gap-4 bg-muted/35 px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground" data-testid="text-preferences-status">{saved ? 'Preferences saved on this device.' : 'Changes are local to this browser.'}</p>
            <button type="button" onClick={savePreferences} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" data-testid="button-save-preferences">
              {saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? 'Saved' : 'Save preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}