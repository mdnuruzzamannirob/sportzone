import { FileInput } from '../ui/file-input'
import { useEffect, useId, useState } from 'react'
import { Button } from '../ui/button'
import { Notice } from '../ui/feedback'

type UploadState = 'selected' | 'uploading' | 'uploaded' | 'error'
// Selection checks aid UX only. The backend must inspect bytes, policy and access.
export function FileUpload({
  label,
  file,
  onSelect,
  onRemove,
  acceptedTypes,
  maxBytes,
  state = 'selected',
  progress,
  error,
  onRetry,
  isDisabled = false,
}: {
  label: string
  file: File | null
  onSelect: (file: File) => void
  onRemove: () => void
  acceptedTypes: readonly string[]
  maxBytes: number
  state?: UploadState
  progress?: number
  error?: string
  onRetry?: () => void
  isDisabled?: boolean
}) {
  const id = useId()
  const [preview, setPreview] = useState<string>()
  useEffect(() => {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPreview(undefined)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const [selectionError, setSelectionError] = useState<string>()
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !acceptedTypes.length)
    throw new RangeError('Explicit upload constraints are required')
  const pending = state === 'uploading'
  const disabled = isDisabled || pending
  const issue = selectionError || error
  const validProgress =
    progress !== undefined &&
    Number.isFinite(progress) &&
    progress >= 0 &&
    progress <= 100
  return (
    <div className="min-w-0 space-y-3">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <p id={`${id}-help`} className="break-words text-sm text-muted">
        {acceptedTypes.map(type => type.split('/')[1].toUpperCase()).join(', ')} · Up to {Math.round(maxBytes / 1024)} KB
      </p>
      <FileInput
        id={id}
        accept={acceptedTypes.join(',')}
        disabled={disabled}
        aria-describedby={`${id}-help${issue ? ` ${id}-error` : ''}`}
        aria-invalid={!!issue}
        onChange={(event) => {
          const candidate = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!candidate || disabled) return
          if (
            !acceptedTypes.includes(candidate.type) ||
            candidate.size > maxBytes ||
            candidate.size === 0
          ) {
            setSelectionError(
              'Choose a nonempty file of a supported type within the size limit.',
            )
            return
          }
          setSelectionError(undefined)
          onSelect(candidate)
        }}
      />
      {file && (
        <div className="space-y-2">
          {preview && (
            <img
              src={preview}
              alt={`Local preview of ${file.name}`}
              className="h-32 w-32 object-contain"
            />
          )}
          <p className="break-all">
            Selected: {file.name} · {file.size} bytes
          </p>
          <p role="status">
            {pending
              ? 'Uploading…'
              : state === 'uploaded'
                ? 'Upload confirmed by server.'
                : state === 'error'
                  ? 'Upload failed. File selection retained.'
                  : 'Selected locally; not uploaded.'}
          </p>
          {pending && (
            <progress
              aria-label="Upload progress"
              max={100}
              value={validProgress ? progress : undefined}
              className="w-full"
            />
          )}
          <Button
            variant="outline"
            isDisabled={disabled}
            onPress={() => {
              setSelectionError(undefined)
              onRemove()
            }}
          >
            Remove file
          </Button>
          {state === 'error' && onRetry && (
            <Button variant="outline" isDisabled={disabled} onPress={onRetry}>
              Retry upload
            </Button>
          )}
        </div>
      )}
      {issue && (
        <div id={`${id}-error`}>
          <Notice tone="error" title="File needs attention">
            {issue}
          </Notice>
        </div>
      )}
    </div>
  )
}
