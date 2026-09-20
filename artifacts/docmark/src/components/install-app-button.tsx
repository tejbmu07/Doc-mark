import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!installPrompt) return null;

  async function installApp() {
    const prompt = installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }

  return (
    <button
      type="button"
      onClick={() => void installApp()}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/[0.08] px-3 py-1.5 font-mono-app text-[9px] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/15"
    >
      <Download size={11} />
      Install app
    </button>
  );
}