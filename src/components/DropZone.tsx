import { useEffect, useRef, useState } from 'react';
import { ACCEPT, filesFromDataTransfer, filesFromInput, type Picked } from '../lib/folderInput';
import { pastedName } from '../lib/naming';

export function DropZone({ onFiles, compact }: { onFiles: (p: Picked[]) => void; compact: boolean }) {
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  // Paste from clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      const now = new Date();
      onFiles(
        files.map((f, i) => {
          const name = f.name && f.name !== 'image.png' ? f.name : pastedName(new Date(now.getTime() + i * 1000), f.type);
          return { file: new File([f], name, { type: f.type }), relativePath: name };
        }),
      );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        filesFromDataTransfer(e.dataTransfer).then(onFiles);
      }}
      className={`rounded-2xl border-2 border-dashed text-center transition-colors ${
        over ? 'border-accent bg-accent/10' : 'border-line bg-surface'
      } ${compact ? 'px-4 py-5' : 'px-6 py-14'}`}
    >
      <p className={`font-semibold ${compact ? 'text-base' : 'text-xl'}`}>Drop images or folders here</p>
      <p className="mt-1 text-sm text-muted">JPG / JPEG / JFIF, PNG, WebP, AVIF · or paste with Ctrl/⌘+V</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()}>
          Choose images
        </button>
        <button type="button" className="btn" onClick={() => dirInput.current?.click()}>
          Choose folder
        </button>
      </div>
      {!compact && (
        <p className="mt-4 text-xs text-muted">🔒 Processed on your device. Your images are never uploaded.</p>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(filesFromInput(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={dirInput}
        type="file"
        hidden
        webkitdirectory=""
        onChange={(e) => {
          if (e.target.files) onFiles(filesFromInput(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}
