'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Document as PdfDocument, Page, pdfjs } from 'react-pdf';
import { useOptionalCitation } from '@/components/document/interactive-citation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export function DocumentPreviewInner({ documentId, contentType, filename }: { documentId: string; contentType?: string | null; filename: string }) {
  const citation = useOptionalCitation();
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/documents/${documentId}/preview`, {
          credentials: 'include'
        });
        if (!res.ok) throw new Error(`Preview unavailable (${res.status})`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Preview unavailable');
      }
    }

    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  useEffect(() => {
    if (!citation?.selectedPageNumber || !numPages) return;
    setPageNumber(Math.min(Math.max(citation.selectedPageNumber, 1), numPages));
  }, [citation?.selectedPageNumber, numPages]);

  const isPdf = contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

  return (
    <div className="grid min-h-[520px] grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{filename}</p>
          <p className="text-xs text-muted-foreground">{contentType ?? 'Stored document'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {isPdf && (
            <div className="mr-1 hidden items-center gap-1 rounded-md border border-border bg-background px-1 sm:flex">
              <Button type="button" variant="ghost" size="icon" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>
                <ChevronLeft />
              </Button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">Page {pageNumber} of {numPages ?? '...'}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Next page" disabled={numPages == null || pageNumber >= numPages} onClick={() => setPageNumber((value) => Math.min(numPages ?? value, value + 1))}>
                <ChevronRight />
              </Button>
            </div>
          )}
          <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}><ZoomOut /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}><ZoomIn /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Rotate preview" onClick={() => setRotation((value) => value + 90)}><RotateCw /></Button>
        </div>
      </div>
      {isPdf && (
        <div className="flex items-center justify-center gap-2 border-b border-border px-3 py-2 sm:hidden">
          <Button type="button" variant="secondary" size="sm" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {pageNumber} of {numPages ?? '...'}</span>
          <Button type="button" variant="secondary" size="sm" disabled={numPages == null || pageNumber >= numPages} onClick={() => setPageNumber((value) => Math.min(numPages ?? value, value + 1))}>Next</Button>
        </div>
      )}
      <div className="grid place-items-center overflow-auto bg-muted/45 p-4" onKeyDown={(event) => {
        if (!isPdf) return;
        if (event.key === 'ArrowLeft') setPageNumber((value) => Math.max(1, value - 1));
        if (event.key === 'ArrowRight') setPageNumber((value) => Math.min(numPages ?? value, value + 1));
      }} tabIndex={isPdf ? 0 : -1}>
        {!url && !error && <Skeleton className="h-full min-h-96 w-full" />}
        {error && (
          <div className="grid place-items-center gap-2 text-center text-muted-foreground">
            <FileText className="size-10" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        {url && isPdf && (
          <PdfDocument
            file={url}
            loading={<Skeleton className="h-[640px] w-[460px] max-w-full" />}
            error={<p className="text-sm text-muted-foreground">PDF preview unavailable.</p>}
            onLoadSuccess={({ numPages: loadedPages }) => {
              setNumPages(loadedPages);
              setPageNumber((value) => Math.min(Math.max(value, 1), loadedPages));
            }}
          >
            <Page
              pageNumber={pageNumber}
              scale={zoom}
              rotate={rotation}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="overflow-hidden rounded-md border border-border bg-background shadow-sm"
            />
          </PdfDocument>
        )}
        {url && !isPdf && (
          <img
            src={url}
            alt={`Preview of ${filename}`}
            className="max-h-[720px] max-w-full rounded-md border border-border bg-background object-contain shadow-sm"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: 'center' }}
          />
        )}
      </div>
    </div>
  );
}
