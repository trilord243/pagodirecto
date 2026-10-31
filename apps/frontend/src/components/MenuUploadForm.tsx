import { useState, type FormEvent } from 'react'
import { MAX_FILES, validateFile } from '../lib/menuUpload.ts'
import { FileDropzone } from './FileDropzone.tsx'

interface MenuUploadFormProps {
  // Los archivos del envío anterior, para reintentar sin volver a elegirlos.
  initialFiles: File[]
  serverError: string | null
  onCancel: () => void
  onManual: () => void
  onSubmit: (files: File[]) => void
}

export function MenuUploadForm({
  initialFiles,
  serverError,
  onCancel,
  onManual,
  onSubmit,
}: MenuUploadFormProps) {
  const [files, setFiles] = useState(initialFiles)
  const [error, setError] = useState<string | undefined>()
  const message = error ?? serverError

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (files.length === 0) {
      setError('Sube al menos un archivo con tu menú.')
      return
    }

    setError(undefined)
    onSubmit(files)
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
          onAdd={addFiles}
          onRemove={(index) => setFiles(files.filter((_, i) => i !== index))}
        />
        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
      </section>

      <div className="form-actions">
        <div className="form-actions__buttons">
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
          >
            Volver
          </button>
          <button type="submit" className="button button--primary">
            {serverError ? 'Intentar de nuevo' : 'Enviar menú'}
          </button>
        </div>
        <p className="form-actions__alternative">
          ¿No tienes el menú en un archivo?{' '}
          <button type="button" className="text-button" onClick={onManual}>
            Créalo a mano, plato por plato
          </button>
        </p>
        <p className="form-actions__legal">
          Al enviar confirmas que eres responsable del comercio y de la
          información del menú.
        </p>
      </div>
    </form>
  )
}
