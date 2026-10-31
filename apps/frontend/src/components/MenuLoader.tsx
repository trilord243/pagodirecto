import { useEffect, useId, useState } from 'react'
import './MenuLoader.css'

// La "P" de PagoDirecto, la misma del favicon.
const LOGO_MARK =
  'M30.914 2.31277L27.5307 0.297493V11.3431C24.65 9.15511 21.054 7.85958 17.1487 7.85958C7.73333 7.85958 0.087 15.4025 0 24.7303V49.1535L3.38333 47.1383L6.76667 49.1535V38.4438C9.64733 40.6222 13.2433 41.9177 17.1487 41.9177C26.5543 41.9177 34.191 34.4036 34.2973 25.095V0.297493L30.914 2.31277ZM17.1487 35.2002C11.4163 35.2002 6.76667 30.5842 6.76667 24.8935C6.76667 19.2027 11.4163 14.5772 17.1487 14.5772C22.881 14.5772 27.5403 19.1931 27.5403 24.8935C27.5403 30.5938 22.8907 35.2002 17.1487 35.2002Z'

// La subida se mide de verdad; el escaneo no informa su avance, así que se
// estima con una curva que se frena y nunca llega a 100 antes de terminar.
const UPLOAD_SHARE = 20
const SCAN_CEILING = 97
const SCAN_PACE_SECONDS = 16
const TICK_MS = 250

const SCAN_MESSAGES = [
  { after: 0, text: 'Leyendo tu menú…' },
  { after: 6, text: 'Buscando platos y precios…' },
  { after: 14, text: 'Ordenando tus categorías…' },
  { after: 26, text: 'Ya casi terminamos…' },
  { after: 45, text: 'Sigue leyendo. Los menús largos tardan un poco más.' },
]

function scanPercent(seconds: number) {
  const remaining = Math.exp(-seconds / SCAN_PACE_SECONDS)
  return Math.floor(SCAN_CEILING - (SCAN_CEILING - UPLOAD_SHARE) * remaining)
}

interface MenuLoaderProps {
  stage: 'uploading' | 'scanning'
  uploadPercent: number
}

export function MenuLoader({ stage, uploadPercent }: MenuLoaderProps) {
  const clipId = useId()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (stage !== 'scanning') return
    const startedAt = performance.now()
    const timer = setInterval(
      () => setSeconds((performance.now() - startedAt) / 1000),
      TICK_MS,
    )
    return () => clearInterval(timer)
  }, [stage])

  const percent =
    stage === 'uploading'
      ? Math.floor((uploadPercent * UPLOAD_SHARE) / 100)
      : scanPercent(seconds)
  const message =
    stage === 'uploading'
      ? 'Subiendo tu menú…'
      : SCAN_MESSAGES.findLast(({ after }) => seconds >= after)?.text
  const filled = (50 * percent) / 100

  return (
    <div className="menu-loader">
      <div
        className="menu-loader__logo"
        role="progressbar"
        aria-label={message}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <svg viewBox="0 0 35 50" aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect
                className="menu-loader__level"
                width="35"
                height={filled}
                y={50 - filled}
              />
            </clipPath>
          </defs>
          <path className="menu-loader__empty" d={LOGO_MARK} />
          <path
            className="menu-loader__fill"
            d={LOGO_MARK}
            clipPath={`url(#${clipId})`}
          />
        </svg>
      </div>
      <span className="menu-loader__percent" aria-hidden="true">
        {percent}%
      </span>
      <span className="menu-loader__message">{message}</span>
    </div>
  )
}
