import './LoyaltyCard.css'

// Cada compra llena un "ojito": el círculo de la P de PagoDirecto. Las mismas
// proporciones de la tarjeta que recibe el cliente por WhatsApp.
export function LoyaltyEye({ filled }: { filled: boolean }) {
  return (
    <svg className="eye" viewBox="0 0 100 100" aria-hidden="true">
      {filled ? (
        <>
          <circle className="eye__disc" cx="50" cy="50" r="50" />
          <circle className="eye__center" cx="50" cy="50" r="21" />
        </>
      ) : (
        <circle className="eye__ring" cx="50" cy="50" r="47.5" />
      )}
    </svg>
  )
}

function eyes(stamps: number, stampsRequired: number) {
  return Array.from({ length: stampsRequired }, (_, index) => (
    <LoyaltyEye key={index} filled={index < stamps} />
  ))
}

interface LoyaltyCardPreviewProps {
  businessName: string
  stamps: number
  stampsRequired: number
  // null mientras el comercio no escoja un plato.
  rewardName: string | null
}

export function LoyaltyCardPreview({
  businessName,
  stamps,
  stampsRequired,
  rewardName,
}: LoyaltyCardPreviewProps) {
  const missing = stampsRequired - stamps
  return (
    <div className="loyalty-card">
      <span className="loyalty-card__brand">PagoDirecto</span>
      <span className="loyalty-card__name">{businessName}</span>
      <span className="loyalty-card__count">
        Tarjeta de fidelidad: {stamps} de {stampsRequired}
      </span>
      <div className="loyalty-card__eyes">{eyes(stamps, stampsRequired)}</div>
      <span className="loyalty-card__footer">
        Te {missing === 1 ? 'falta' : 'faltan'} {missing} para tu premio
        {rewardName ? `: ${rewardName}` : ''}
      </span>
    </div>
  )
}

interface LoyaltyProgressProps {
  stamps: number
  stampsRequired: number
}

// Si el comercio baja la meta, un cliente puede llevar más de las que ahora pide.
export function LoyaltyProgress({ stamps, stampsRequired }: LoyaltyProgressProps) {
  const shown = Math.min(stamps, stampsRequired)
  return (
    <span
      className="loyalty-progress"
      role="img"
      aria-label={`${shown} de ${stampsRequired} compras en la tarjeta`}
    >
      <span className="loyalty-progress__eyes">
        {eyes(shown, stampsRequired)}
      </span>
      <span className="loyalty-progress__count">
        {shown} de {stampsRequired}
      </span>
    </span>
  )
}
