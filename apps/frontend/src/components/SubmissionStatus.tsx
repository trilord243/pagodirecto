import type { ReactNode } from 'react'
import { ChatIcon, CheckIcon, EditIcon, ScanIcon, UploadIcon } from './Icons.tsx'
import { MenuLoader } from './MenuLoader.tsx'

export type ProcessingStage = 'uploading' | 'scanning' | 'ready' | 'published'

interface SubmissionStatusProps {
  fileCount: number
  restaurantId: string
  stage: ProcessingStage
  uploadPercent: number
  productCount: number
  onReview: () => void
  onReset: () => void
}

type StepState = 'done' | 'current' | 'pending'

const WAIT_MESSAGE = 'Suele tardar menos de un minuto. Mantén esta página abierta.'

const CHIP_LABEL: Record<StepState, string> = {
  done: 'Hecho',
  current: 'En curso',
  pending: 'Pendiente',
}

export function SubmissionStatus({
  fileCount,
  restaurantId,
  stage,
  uploadPercent,
  productCount,
  onReview,
  onReset,
}: SubmissionStatusProps) {
  const uploading = stage === 'uploading'
  const working = uploading || stage === 'scanning'

  const steps: { icon: ReactNode; title: string; detail: string; state: StepState }[] = [
    {
      icon: <UploadIcon />,
      title: uploading ? 'Subiendo tu menú' : 'Menú recibido',
      detail: `${fileCount} ${fileCount === 1 ? 'archivo' : 'archivos'}`,
      state: uploading ? 'current' : 'done',
    },
    {
      icon: <ScanIcon />,
      title: working ? 'Escaneando tu menú' : 'Menú escaneado',
      detail: working
          ? 'Leemos platos, descripciones y precios.'
          : `Encontramos ${productCount} ${productCount === 1 ? 'producto' : 'productos'}.`,
      state: uploading ? 'pending' : stage === 'scanning' ? 'current' : 'done',
    },
    {
      icon: <EditIcon />,
      title: 'Revisión del comercio',
      detail:
        stage === 'published'
          ? 'Confirmaste tu menú.'
          : 'Verifica que todo esté correcto.',
      state: working ? 'pending' : stage === 'ready' ? 'current' : 'done',
    },
    {
      icon: <ChatIcon />,
      title: 'Activo en WhatsApp',
      detail: `Los clientes encuentran tu menú con el ID ${restaurantId}.`,
      state: stage === 'published' ? 'done' : 'pending',
    },
  ]

  const heading = {
    uploading: 'Estamos subiendo tu menú',
    scanning: '¡Recibimos tu menú!',
    ready: 'Tu menú está listo para revisar',
    published: 'Tu menú ya está en WhatsApp',
  }[stage]

  const lead = {
    uploading: WAIT_MESSAGE,
    scanning: WAIT_MESSAGE,
    ready:
      'Revisa lo que leímos y corrige cualquier detalle antes de publicarlo.',
    published:
      'Tus clientes ya pueden pedir en tu comercio desde el WhatsApp de PagoDirecto. Puedes editar el menú cuando quieras.',
  }[stage]

  return (
    <div className="card status-card" role="status">
      {working ? (
        <MenuLoader stage={stage} uploadPercent={uploadPercent} />
      ) : (
        <span className="status-card__check">
          <CheckIcon width={30} height={30} />
        </span>
      )}
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
        ID del comercio: <code>{restaurantId}</code>
      </p>

      <div className="status-card__actions">
        {!working && (
          <button type="button" className="button button--primary" onClick={onReview}>
            {stage === 'ready' ? 'Revisar mi menú' : 'Editar menú'}
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onReset}>
          {working ? 'Cancelar' : 'Subir otro menú'}
        </button>
      </div>
    </div>
  )
}
