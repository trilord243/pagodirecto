import { useEffect, useRef, useState } from 'react'

interface OriginalMenuPreviewProps {
  files: File[]
}

export function OriginalMenuPreview({ files }: OriginalMenuPreviewProps) {
  const [selected, setSelected] = useState(0)
  const file = files[Math.min(selected, files.length - 1)]

  return (
    <section className="card original-card">
      <h2>Tu menú original</h2>
      <p className="original-card__hint">
        Compáralo con lo que leímos y corrige lo que haga falta.
      </p>

      {files.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Archivos del menú">
          {files.map((f, index) => (
            <button
              key={`${f.name}-${f.lastModified}`}
              type="button"
              role="tab"
              aria-selected={index === selected}
              className="segmented__option"
              onClick={() => setSelected(index)}
              title={f.name}
            >
              Archivo {index + 1}
            </button>
          ))}
        </div>
      )}

      {file && <FilePreview key={`${file.name}-${file.lastModified}`} file={file} />}
    </section>
  )
}

function FilePreview({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    const target = isImage ? imageRef.current : frameRef.current
    if (!target) return
    const url = URL.createObjectURL(file)
    target.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <div className="original-card__frame">
      {isImage ? (
        <img ref={imageRef} alt={`Menú original: ${file.name}`} />
      ) : (
        <iframe ref={frameRef} title={`Menú original: ${file.name}`} />
      )}
      <span className="original-card__name">{file.name}</span>
    </div>
  )
}
