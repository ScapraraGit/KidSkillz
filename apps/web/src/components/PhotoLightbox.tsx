import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt: string;
  thumb?: boolean;
}

export function PhotoLightbox({ src, alt, thumb = true }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {thumb ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open photo: ${alt}`}
          className="inline-block rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <img src={src} alt="" className="w-16 h-16 object-cover" loading="lazy" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-brand-700 underline hover:no-underline"
        >
          View photo
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 text-white text-3xl leading-none rounded-full bg-slate-900/60 hover:bg-slate-900/90 w-10 h-10 flex items-center justify-center"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
