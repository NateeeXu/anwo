import { forwardRef, useId, useRef, useState, type HTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react'
import { ApiError, uploadFiles } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { Badge } from './Badge'

export interface UploaderFile {
  /** Local id (stable across uploads) */
  id: string
  /** Preview URL (object URL while uploading, server URL after) */
  url: string
  name?: string
  /** 0..1 while uploading; undefined when done */
  progress?: number
  /** Inline error for this file */
  error?: string
  /** Server upload id once uploaded (send this to the API) */
  uploadId?: string
  /** Original File while uploading */
  file?: File
}

export interface PhotoUploaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  files: UploaderFile[]
  /** Called with the full new list on every change (add, progress, done, error, remove, reorder) */
  onChange: (files: UploaderFile[]) => void
  onReorder?: (files: UploaderFile[]) => void
  max?: number
  accept?: string
  maxSizeMB?: number
  /** Upload purpose sent to `POST /api/uploads` (default `listing`) */
  purpose?: string
  isPrivate?: boolean
  /** Replace the default uploader (e.g. for tests) */
  upload?: (file: File, onProgress: (f: number) => void) => Promise<{ id: string; url: string }>
  disabled?: boolean
  label?: string
}

let seq = 0

/** DESIGN.md §5 PhotoUploader: dashed drop zone, 96 px draggable thumbs, first = 「封面」, 2 px accent progress, inline errors. */
export const PhotoUploader = forwardRef<HTMLDivElement, PhotoUploaderProps>(function PhotoUploader(
  { files, onChange, onReorder, max = 10, accept = 'image/jpeg,image/png,image/webp,image/heic', maxSizeMB = 10, purpose = 'listing', isPrivate, upload, disabled, label, className, ...rest },
  ref,
) {
  const t = useT()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const latest = useRef(files)
  latest.current = files
  const [dragOver, setDragOver] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)

  const emit = (next: UploaderFile[]) => {
    latest.current = next
    onChange(next)
  }
  const patch = (fid: string, p: Partial<UploaderFile>) => emit(latest.current.map((f) => (f.id === fid ? { ...f, ...p } : f)))

  const doUpload = async (entry: UploaderFile) => {
    const file = entry.file!
    try {
      let res: { id: string; url: string }
      if (upload) res = await upload(file, (p) => patch(entry.id, { progress: p }))
      else {
        const [u] = await uploadFiles([file], purpose, isPrivate, { onProgress: (p) => patch(entry.id, { progress: p }) })
        res = { id: u.id, url: u.url }
      }
      patch(entry.id, { progress: undefined, uploadId: res.id, url: res.url, file: undefined })
      URL.revokeObjectURL(entry.url)
    } catch (e) {
      const msg = e instanceof ApiError ? (e.code === 'UPLOAD_TOO_LARGE' ? t('ui.fileTooLarge', { size: maxSizeMB }) : e.code === 'UNSUPPORTED_MEDIA' ? t('ui.fileType') : t('ui.uploadFailed')) : t('ui.uploadFailed')
      patch(entry.id, { progress: undefined, error: msg })
    }
  }

  const addFiles = (list: FileList | File[]) => {
    if (disabled) return
    setLimitError(null)
    const room = max - latest.current.length
    const arr = Array.from(list)
    if (arr.length > room) setLimitError(t('ui.maxFiles', { max }))
    const accepted = accept.split(',').map((s) => s.trim().toLowerCase())
    const entries: UploaderFile[] = arr.slice(0, Math.max(0, room)).map((file) => {
      const fid = `up${++seq}`
      const okType = accepted.some((a) => a === '*' || a === 'image/*' ? file.type.startsWith('image/') : a === file.type.toLowerCase())
      const okSize = file.size <= maxSizeMB * 1024 * 1024
      return {
        id: fid,
        url: URL.createObjectURL(file),
        name: file.name,
        file,
        progress: okType && okSize ? 0 : undefined,
        error: !okType ? t('ui.fileType') : !okSize ? t('ui.fileTooLarge', { size: maxSizeMB }) : undefined,
      }
    })
    if (entries.length === 0) return
    emit([...latest.current, ...entries])
    for (const e of entries) if (!e.error) void doUpload(e)
  }

  const remove = (fid: string) => {
    const f = latest.current.find((x) => x.id === fid)
    if (f?.file) URL.revokeObjectURL(f.url)
    emit(latest.current.filter((x) => x.id !== fid))
  }

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= latest.current.length) return
    const next = [...latest.current]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    emit(next)
    onReorder?.(next)
  }

  const full = files.length >= max

  return (
    <div ref={ref} className={cn('flex flex-col gap-3', className)} {...rest}>
      {!full && (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            addFiles(e.dataTransfer.files)
          }}
          data-state={dragOver ? 'drag-over' : undefined}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-8 text-center transition-colors duration-token-base',
            dragOver ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-sunken',
            disabled && 'cursor-not-allowed opacity-50',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
          )}
        >
          <ImagePlus size={28} strokeWidth={1.5} className="text-ink-3" aria-hidden />
          <span className="text-body font-medium text-ink">{label ?? t('ui.dropzone')}</span>
          <span className="text-small text-ink-3">{t('ui.dropzoneHint', { max, size: maxSizeMB })}</span>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={accept}
            multiple={max > 1}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}
      {limitError && (
        <p className="text-small text-danger" role="alert">
          {limitError}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label={t('ui.photo')}>
          {files.map((f, i) => (
            <li
              key={f.id}
              draggable={!disabled && !f.error}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIdx != null) move(dragIdx, i)
                setDragIdx(null)
              }}
              onDragEnd={() => setDragIdx(null)}
              data-state={f.error ? 'error' : f.progress != null ? 'uploading' : 'done'}
              className={cn('group/thumb relative flex w-24 flex-col gap-1', dragIdx === i && 'opacity-50')}
            >
              <div className={cn('relative size-24 overflow-hidden rounded-sm bg-sunken', f.error && 'ring-2 ring-danger')}>
                <img src={f.url} alt={f.name ?? ''} className={cn('size-full object-cover dark:brightness-[.92]', f.progress != null && 'opacity-60')} />
                {i === 0 && !f.error && (
                  <Badge variant="neutral" size="sm" className="absolute bottom-1 left-1 bg-inverse text-ink-inverse">
                    {t('ui.cover')}
                  </Badge>
                )}
                {f.progress != null && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
                    <div className="h-full bg-accent transition-[width] duration-token-fast" style={{ width: `${Math.round(f.progress * 100)}%` }} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  aria-label={t('ui.remove')}
                  className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm hover:bg-surface"
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
                {!f.error && files.length > 1 && (
                  <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition-opacity group-focus-within/thumb:opacity-100 group-hover/thumb:opacity-100">
                    {i > 0 && (
                      <button type="button" onClick={() => move(i, i - 1)} aria-label={t('ui.moveLeft')} className="inline-flex size-6 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm">
                        <ChevronLeft size={14} aria-hidden />
                      </button>
                    )}
                    {i < files.length - 1 && (
                      <button type="button" onClick={() => move(i, i + 1)} aria-label={t('ui.moveRight')} className="inline-flex size-6 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm">
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {f.error ? (
                <span className="text-caption text-danger" role="alert">
                  {f.error}
                </span>
              ) : f.progress != null ? (
                <span className="text-caption text-ink-3">{t('ui.uploading')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
