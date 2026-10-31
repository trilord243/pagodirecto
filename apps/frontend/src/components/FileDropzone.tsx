import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { ACCEPT_ATTR, MAX_FILES, formatSize } from '../lib/menuUpload.ts'
import { CloseIcon, MenuIcon, UploadIcon } from './Icons.tsx'

interface FileDropzoneProps {
  files: File[]
  disabled?: boolean
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

export function FileDropzone({
  files,
  disabled,
  onAdd,
  onRemove,
}: FileDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const full = files.length >= MAX_FILES

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    if (disabled || full) return
    onAdd(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="dropzone-group">
      <label
        htmlFor={inputId}
        className={[
          'dropzone',
          dragging && 'dropzone--dragging',
          (disabled || full) && 'dropzone--disabled',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !full) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="dropzone__icon">
          <UploadIcon width={28} height={28} />
        </span>
        <span className="dropzone__title">
          {full ? 'Llegaste al máximo de archivos' : 'Arrastra tu menú aquí'}
        </span>
        <span className="dropzone__hint">
          {full ? (
            `Puedes subir hasta ${MAX_FILES} archivos`
          ) : (
            <>
              o <span className="dropzone__link">búscalo en tu equipo</span>
            </>
          )}
        </span>
        <span className="dropzone__formats">
          PDF, JPG, PNG o WebP · máx. 10 MB c/u · hasta {MAX_FILES} archivos
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="visually-hidden"
          accept={ACCEPT_ATTR}
          multiple
          disabled={disabled || full}
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="file-list" aria-label="Archivos seleccionados">
          {files.map((file, index) => (
            <FileItem
              key={`${file.name}-${file.size}-${file.lastModified}`}
              file={file}
              disabled={disabled}
              onRemove={() => {
                onRemove(index)
                inputRef.current?.focus()
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface FileItemProps {
  file: File
  disabled?: boolean
  onRemove: () => void
}

function FileItem({ file, disabled, onRemove }: FileItemProps) {
  const previewRef = useRef<HTMLImageElement>(null)
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    if (!isImage || !previewRef.current) return
    const url = URL.createObjectURL(file)
    previewRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <li className="file-item">
      <span className={`file-item__thumb ${isImage ? '' : 'file-item__thumb--pdf'}`}>
        {isImage ? (
          <img ref={previewRef} alt="" />
        ) : (
          <MenuIcon width={22} height={22} />
        )}
      </span>
      <span className="file-item__info">
        <span className="file-item__name">{file.name}</span>
        <span className="file-item__meta">
          {isImage ? 'Imagen' : 'PDF'} · {formatSize(file.size)}
        </span>
      </span>
      <button
        type="button"
        className="icon-button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Quitar ${file.name}`}
      >
        <CloseIcon width={18} height={18} />
      </button>
    </li>
  )
}
