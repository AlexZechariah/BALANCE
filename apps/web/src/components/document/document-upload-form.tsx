'use client';

import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FileImage, FileText, FileUp, Loader2, Trash2, UploadCloud } from 'lucide-react';

import { uploadDocument } from '@/lib/api/documents';
import { BalanceApiError } from '@/lib/api/client';
import {
  balanceCategories,
  categoryLabel,
  claimIntentLabel,
  consumerRecordTypes,
  enterpriseClaimIntents,
  recordTypeLabel,
} from '@/lib/display-labels';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type UploadMode = 'consumer' | 'enterprise';

export function DocumentUploadForm({ mode }: { mode: UploadMode }) {
  const router = useRouter();
  const dropHintId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('other');
  const [tags, setTags] = useState('');
  const [recordType, setRecordType] = useState('personal');
  const [claimIntent, setClaimIntent] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isEnterprise = mode === 'enterprise';

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function acceptFiles(selected: File[]) {
    setError(null);
    if (selected.length === 0) return;

    if (selected.length > 1) {
      setError('Upload one document at a time for this MVP.');
      return;
    }

    const nextFile = selected[0];
    if (!nextFile) return;
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setError(`Unsupported file type for ${nextFile.name}. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (nextFile.size > MAX_SIZE_BYTES) {
      setError(`${nextFile.name} is too large. Maximum size is 10 MiB.`);
      return;
    }

    setFile(nextFile);
    if (!label.trim()) {
      setLabel(nextFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    acceptFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError('Select one document before uploading.');
      return;
    }
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    if (!category) {
      setError('Category is required.');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const response = await uploadDocument(file, label.trim(), notes.trim() || undefined, category, tags.trim() || undefined, isEnterprise && claimIntent !== 'none' ? claimIntent : undefined, isEnterprise ? undefined : recordType);
      setProgress(100);

      const detailBase = isEnterprise ? '/enterprise/documents' : '/app/documents';
      router.replace(`${detailBase}/${response.document.id}?edit=1`);
    } catch (err) {
      if (err instanceof BalanceApiError) {
        if (err.status === 413) setError('File is too large. Maximum size is 10 MiB.');
        else if (err.status === 415) setError('Unsupported file type.');
        else if (err.status === 503) setError('Storage service unavailable. Please try again.');
        else setError(err.error.message);
      } else {
        setError('Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.45fr]">
      <div className="grid gap-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Upload Documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">Select or drag one receipt, invoice, or PDF for extraction.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <Card variant="panel">
            <CardContent className="p-5">
              <motion.button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                whileTap={{ scale: 0.995 }}
                className={`flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition cursor-pointer ${
                  dragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background/60 hover:border-primary/60 hover:bg-muted/50'
                }`}
                disabled={uploading}
                aria-describedby={dropHintId}
                aria-label="Choose one document or drop it here"
              >
                <UploadCloud className={`mb-3 size-10 transition-colors ${dragActive ? 'text-primary' : 'text-muted-foreground/60'}`} />
                <span className="font-medium text-foreground">{file ? 'Replace selected document' : 'Drop one receipt, invoice, or PDF here'}</span>
                <span id={dropHintId} className="mt-1 text-sm text-muted-foreground">PDF, JPEG, PNG, max 10 MiB</span>
              </motion.button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={handleFileChange}
                disabled={uploading}
                className="sr-only"
              />

              {file && (
                <div className="mt-4 grid gap-2">
                  <motion.div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    layout
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                  >
                    {file.type === 'application/pdf' ? <FileText className="size-4 text-info" /> : <FileImage className="size-4 text-success" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Badge variant="neutral">{file.type.split('/').pop()?.toUpperCase()}</Badge>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} disabled={uploading} onClick={() => setFile(null)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </motion.div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="label">Label <span className="text-destructive">*</span></Label>
              <Input id="label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={uploading} placeholder={isEnterprise ? 'Vendor invoice' : 'Weekend receipt'} required />
            </div>
            <div>
              <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
              <Select value={category} onValueChange={setCategory} disabled={uploading}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {balanceCategories.map((value) => (
                    <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={isEnterprise ? 'claimIntent' : 'recordType'}>{isEnterprise ? 'Claim intent' : 'Record type'}</Label>
              {isEnterprise ? (
                <Select value={claimIntent} onValueChange={setClaimIntent} disabled={uploading}>
                  <SelectTrigger id="claimIntent"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not Decided</SelectItem>
                    {enterpriseClaimIntents.map((value) => (
                      <SelectItem key={value} value={value}>{claimIntentLabel(value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={recordType} onValueChange={setRecordType} disabled={uploading}>
                  <SelectTrigger id="recordType"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {consumerRecordTypes.map((value) => (
                      <SelectItem key={value} value={value}>{recordTypeLabel(value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">{isEnterprise ? 'Policy/context notes' : 'Notes'}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={uploading}
              rows={3}
              placeholder={isEnterprise ? 'Policy, cost centre, approver context, or reimbursement details' : 'Purpose, warranty window, return context, or tax details'}
            />
          </div>

          {error && <Alert role="alert" variant="destructive">{error}</Alert>}
          {uploading && <Progress value={progress} />}

          <details className="rounded-md border border-border bg-muted/25 p-4">
            <summary className="cursor-pointer text-sm font-medium">More Details</summary>
            <div className="mt-3">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} disabled={uploading} placeholder={isEnterprise ? 'policy, client-a, travel' : 'tax, warranty, return'} />
              <p className="mt-1 text-xs text-muted-foreground">Optional metadata for search. Categories drive insights and budgets.</p>
            </div>
          </details>

          <Button type="submit" disabled={uploading || !file || !label.trim() || !category} className="w-fit">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {uploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </form>
      </div>

      <Card variant="surface">
        <CardHeader>
          <CardTitle>Selected File</CardTitle>
        </CardHeader>
        <CardContent>
          {!file && (
            <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-border bg-muted/25 p-6 text-center text-sm text-muted-foreground">
              <div>
                <FileText className="mx-auto mb-3 size-8" />
                <p className="font-medium text-foreground">No file selected</p>
                <p className="mt-1">Choose one document to see its preview before extraction.</p>
              </div>
            </div>
          )}
          {file && (
            <div className="grid gap-3">
              {previewUrl && file.type.startsWith('image/') && (
                <img src={previewUrl} alt={`Preview of ${file.name}`} className="max-h-[560px] w-full rounded-md border border-border bg-background object-contain" />
              )}
              {previewUrl && file.type === 'application/pdf' && (
                <iframe title={`Preview of ${file.name}`} src={previewUrl} className="h-[560px] w-full rounded-md border border-border bg-background" />
              )}
              <div className="rounded-md border border-border bg-background p-3 text-sm">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {file.type === 'application/pdf' ? 'PDF' : 'Image'}</p>
              </div>
              <Alert variant="info">AWS Textract analyzes the selected file after upload when extraction is configured.</Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
