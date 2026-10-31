import { useState, type FormEvent } from 'react'
import {
  MAX_FILES,
  submitMenu,
  validateFile,
  type MenuSubmission,
} from '../lib/menuUpload.ts'
import { FileDropzone } from './FileDropzone.tsx'

interface MenuUploadFormProps {
  restaurantId: string
  onCancel: () => void
  onSubmitted: (submission: MenuSubmission) => void
}

export function MenuUploadForm({
  restaurantId,
  onCancel,
  onSubmitted,
}: MenuUploadFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | undefined>()
  const [progress, setProgress] = useState<number | null>(null)
  const uploading = progress !== null

  function addFiles(incoming: File[]) {
    const accepted: File[] = []
    let problem: string | undefined
    for (const file of incoming) {
      const invalid = validateFile(file)
      if (invalid) {
        problem = invalid
        continue
      }
      const duplicate = files.some(
        (f) => f.name === file.name && f.size === file.size,
      )
      if (!duplicate) accepted.push(file)
    }
    const room = MAX_FILES - files.length
    if (accepted.length > room) {
      problem = `Solo puedes subir ${MAX_FILES} archivos en total.`
    }
    setFiles([...files, ...accepted.slice(0, room)])
    setError(problem)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (files.length === 0) {
      setError('Sube al menos un archivo con tu menú.')
      return
    }

    setError(undefined)
    setProgress(0)
    onSubmitted(await submitMenu(restaurantId, files, setProgress))
  }

  return (
    <form className="card upload-card" onSubmit={handleSubmit} noValidate>
      <section className="form-section">
        <div className="form-section__head">
          <div>
            <h2>Sube tu menú</h2>
            <p>Un PDF o fotos claras donde se lean los platos y precios.</p>
          </div>
        </div>

        <FileDropzone
          files={files}
          disabled={uploading}
          onAdd={addFiles}
          onRemove={(index) => setFiles(files.filter((_, i) => i !== index))}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="form-actions">
        {uploading && (
          <div
            className="progress"
            role="progressbar"
            aria-label="Subiendo menú"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="form-actions__buttons">
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={uploading}
          >
            Volver
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={uploading}
          >
            {uploading ? `Subiendo… ${progress}%` : 'Enviar menú'}
          </button>
        </div>
        <p className="form-actions__legal">
          Al enviar confirmas que eres responsable del comercio y de la
          información del menú.
        </p>
      </div>
    </form>
  )
}
