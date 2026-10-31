import type { ReactNode } from 'react'
import type { MenuSubmission } from '../lib/menuUpload.ts'
import { ChatIcon, CheckIcon, EditIcon, ScanIcon, UploadIcon } from './Icons.tsx'

export type ProcessingStage = 'scanning' | 'ready' | 'published'

interface SubmissionStatusProps {
  submission: MenuSubmission
  stage: ProcessingStage
  productCount: number
  onReview: () => void
  onReset: () => void
}

type StepState = 'done' | 'current' | 'pending'

const CHIP_LABEL: Record<StepState, string> = {
  done: 'Hecho',
  current: 'En curso',
  pending: 'Pendiente',
}

export function SubmissionStatus({
  submission,
  stage,
  productCount,
  onReview,
  onReset,
}: SubmissionStatusProps) {
  const fileCount = submission.files.length

  const steps: { icon: ReactNode; title: string; detail: string; state: StepState }[] = [
    {
      icon: <UploadIcon />,
      title: 'Menú recibido',
      detail: `${fileCount} ${fileCount === 1 ? 'archivo' : 'archivos'}`,
      state: 'done',
    },
    {
      icon: <ScanIcon />,
      title: stage === 'scanning' ? 'Escaneando tu menú' : 'Menú escaneado',
      detail:
        stage === 'scanning'
          ? 'Leemos platos, descripciones y precios.'
          : `Encontramos ${productCount} productos.`,
      state: stage === 'scanning' ? 'current' : 'done',
    },
    {
      icon: <EditIcon />,
      title: 'Revisión del comercio',
      detail:
        stage === 'published'
          ? 'Confirmaste tu menú.'
          : 'Verifica que todo esté correcto.',
      state:
        stage === 'scanning' ? 'pending' : stage === 'ready' ? 'current' : 'done',
    },
    {
      icon: <ChatIcon />,
      title: 'Activo en WhatsApp',
      detail: `Los clientes encuentran tu menú con el ID ${submission.restaurantId}.`,
      state: stage === 'published' ? 'done' : 'pending',
    },
  ]

  const heading = {
    scanning: '¡Recibimos tu menú!',
    ready: 'Tu menú está listo para revisar',
    published: 'Tu menú ya está en WhatsApp',
  }[stage]

  const lead = {
    scanning:
      'Lo estamos escaneando. Esto toma solo unos segundos.',
    ready:
      'Revisa lo que leímos y corrige cualquier detalle antes de publicarlo.',
    published:
      'Tus clientes ya pueden pedir en tu comercio desde el WhatsApp de PagoDirecto. Puedes editar el menú cuando quieras.',
  }[stage]

  return (
    <div className="card status-card" role="status">
      <span className={`status-card__check status-card__check--${stage}`}>
        {stage === 'scanning' ? (
          <ScanIcon width={30} height={30} />
        ) : (
          <CheckIcon width={30} height={30} />
        )}
      </span>
      <h2>{heading}</h2>
      <p className="status-card__lead">{lead}</p>

      <ol className="timeline">
        {steps.map((step) => (
          <li key={step.title} className={`timeline__item timeline__item--${step.state}`}>
            <span className="timeline__icon">{step.icon}</span>
            <span>
              <span className="timeline__title">{step.title}</span>
              <span className="timeline__detail">{step.detail}</span>
            </span>
            <span className="timeline__chip">{CHIP_LABEL[step.state]}</span>
          </li>
        ))}
      </ol>

      <p className="status-card__ref">
        ID del comercio: <code>{submission.restaurantId}</code> · Envío{' '}
        <code>{submission.id.slice(0, 8).toUpperCase()}</code>
      </p>

      <div className="status-card__actions">
        {stage !== 'scanning' && (
          <button type="button" className="button button--primary" onClick={onReview}>
            {stage === 'ready' ? 'Revisar mi menú' : 'Editar menú'}
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onReset}>
          Subir otro menú
        </button>
      </div>
    </div>
  )
}
