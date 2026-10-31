import { useEffect, useRef, useState } from 'react'
import { Footer } from './components/Footer.tsx'
import { Header } from './components/Header.tsx'
import { BagIcon, ChatIcon, MenuIcon, ScanIcon } from './components/Icons.tsx'
import { LoadState } from './components/LoadState.tsx'
import { MenuEditor } from './components/MenuEditor.tsx'
import { MenuUploadForm } from './components/MenuUploadForm.tsx'
import { OrdersView } from './components/OrdersView.tsx'
import { OriginalMenuPreview } from './components/OriginalMenuPreview.tsx'
import {
  SubmissionStatus,
  type ProcessingStage,
} from './components/SubmissionStatus.tsx'
import { Welcome } from './components/Welcome.tsx'
import { errorMessage } from './lib/api.ts'
import type { Session } from './lib/auth.ts'
import {
  countItems,
  fetchMenu,
  publishMenu,
  type EditableMenu,
} from './lib/menu.ts'
import { analyzeMenu } from './lib/menuUpload.ts'

const HOW_IT_WORKS = [
  {
    icon: <MenuIcon />,
    tone: 'pink',
    title: 'Sube tu menú',
    text: 'PDF o fotos, tal como lo tienes hoy.',
  },
  {
    icon: <ScanIcon />,
    tone: 'orange',
    title: 'Lo escaneamos',
    text: 'Extraemos platos, descripciones y precios.',
  },
  {
    icon: <ChatIcon />,
    tone: 'blue',
    title: 'Llega a WhatsApp',
    text: 'Queda disponible en el WhatsApp de PagoDirecto con tu ID.',
  },
  {
    icon: <BagIcon />,
    tone: 'purple',
    title: 'Recibe pedidos',
    text: 'El agente virtual muestra tu menú y toma las órdenes.',
  },
]

const HERO_COPY = {
  welcome: {
    title: 'Tu menú, atendiendo pedidos por ti',
    text: 'Sube el menú de tu comercio y el agente virtual de PagoDirecto lo mostrará y tomará pedidos por WhatsApp.',
  },
  upload: {
    title: 'Sube tu menú',
    text: 'PDF o fotos, tal como lo tienes hoy. Nosotros nos encargamos del resto.',
  },
  status: {
    title: 'Estamos preparando tu menú',
    text: 'Te mostramos cada paso para que sepas cuándo tu agente estará listo.',
  },
  published: {
    title: 'Tu menú ya atiende pedidos',
    text: 'Puedes volver a editarlo cuando cambien tus platos o precios.',
  },
  review: {
    title: 'Revisa y ajusta tu menú',
    text: 'Corrige nombres, precios y disponibilidad. Tus clientes verán exactamente esto en WhatsApp.',
  },
  orders: {
    title: 'Tus pedidos',
    text: 'Confirma cada pedido, avísale al cliente cuándo está listo y marca lo que ya te pagaron.',
  },
}

const SECTIONS = [
  { id: 'menu', label: 'Menú' },
  { id: 'orders', label: 'Pedidos' },
] as const

const EMPTY_SCAN =
  'No encontramos productos en estos archivos. Prueba con una foto más nítida.'

type Section = (typeof SECTIONS)[number]['id']
// `home` es el menú publicado o, si aún no hay, la bienvenida.
type View = 'loading' | 'load-error' | 'home' | 'upload' | 'status' | 'review'

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

interface PortalProps {
  session: Session
  onLogout: () => void
}

export function Portal({ session, onLogout }: PortalProps) {
  const [section, setSection] = useState<Section>('menu')
  const [view, setView] = useState<View>('loading')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  // El menú activo en el servidor; null si el comercio aún no publica ninguno.
  const [published, setPublished] = useState<EditableMenu | null>(null)
  // El último envío: sus archivos y lo que se leyó de ellos.
  const [files, setFiles] = useState<File[]>([])
  const [menu, setMenu] = useState<EditableMenu | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('scanning')
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const activeUpload = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchMenu(session.token, controller.signal).then(
      (current) => {
        setPublished(current.categories.length > 0 ? current : null)
        setView('home')
      },
      (error) => {
        if (controller.signal.aborted) return
        setLoadError(errorMessage(error))
        setView('load-error')
      },
    )
    return () => controller.abort()
  }, [session.token, loadAttempt])

  useEffect(() => () => activeUpload.current?.abort(), [])

  async function handleUpload(next: File[]) {
    const controller = new AbortController()
    activeUpload.current = controller
    setFiles(next)
    setMenu(null)
    setUploadError(null)
    setProgress(0)

    try {
      const scanned = await analyzeMenu(
        session.token,
        next,
        (percent) => {
          setProgress(percent)
          if (percent < 100) return
          setStage('scanning')
          setView('status')
          scrollToTop()
        },
        controller.signal,
      )
      setProgress(null)
      if (scanned.categories.length === 0) {
        setUploadError(EMPTY_SCAN)
        setView('upload')
        return
      }
      // Lo escaneado solo se guarda si el comercio lo confirma en el editor.
      setMenu(scanned)
      setStage('ready')
      setView('review')
      scrollToTop()
    } catch (error) {
      if (controller.signal.aborted) return
      setProgress(null)
      setUploadError(errorMessage(error))
      setView('upload')
    }
  }

  function handleReset() {
    activeUpload.current?.abort()
    setFiles([])
    setMenu(null)
    setProgress(null)
    setUploadError(null)
    setView('upload')
    scrollToTop()
  }

  async function handlePublish(next: EditableMenu) {
    const saved = await publishMenu(session.token, next)
    setPublished(saved)
    if (view === 'review') {
      setMenu(saved)
      setStage('published')
      setView('status')
      scrollToTop()
    }
    return saved
  }

  function openUpload() {
    setView('upload')
    scrollToTop()
  }

  function renderMenuSection() {
    if (view === 'loading') {
      return (
        <section className="card">
          <LoadState message="Cargando tu menú…" />
        </section>
      )
    }
    if (view === 'load-error') {
      return (
        <section className="card">
          <LoadState
            message={loadError}
            onRetry={() => {
              setView('loading')
              setLoadAttempt((current) => current + 1)
            }}
          />
        </section>
      )
    }
    if (view === 'upload') {
      return (
        <MenuUploadForm
          initialFiles={files}
          progress={progress}
          serverError={uploadError}
          onCancel={() => {
            setUploadError(null)
            setView('home')
          }}
          onSubmit={handleUpload}
        />
      )
    }
    if (view === 'status') {
      return (
        <SubmissionStatus
          fileCount={files.length}
          restaurantId={session.restaurantId}
          stage={stage}
          productCount={menu ? countItems(menu).total : 0}
          onReview={() => {
            setView('review')
            scrollToTop()
          }}
          onReset={handleReset}
        />
      )
    }
    if (view === 'review' && menu) {
      return (
        <MenuEditor
          key="review"
          accountName={session.username}
          initialMenu={menu}
          published={stage === 'published'}
          hasOriginal
          replacesPublished={published !== null}
          cancelLabel="Volver"
          onCancel={() => {
            setView('status')
            scrollToTop()
          }}
          onPublish={handlePublish}
        />
      )
    }
    if (published) {
      return (
        <MenuEditor
          key="published"
          accountName={session.username}
          initialMenu={published}
          published
          hasOriginal={false}
          replacesPublished={false}
          cancelLabel="Subir otro menú"
          onCancel={openUpload}
          onPublish={handlePublish}
        />
      )
    }
    return <Welcome session={session} onUpload={openUpload} />
  }

  const heroKey =
    section === 'orders'
      ? 'orders'
      : view === 'upload' || view === 'review'
        ? view
        : view === 'status'
          ? stage === 'published'
            ? 'published'
            : 'status'
          : view === 'home' && published
            ? 'published'
            : 'welcome'
  const hero = HERO_COPY[heroKey]

  return (
    <>
      <div className="hero">
        <Header session={session} onLogout={onLogout} />
        <div className="hero__content">
          <span className="hero__eyebrow">Pedidos por WhatsApp</span>
          <h1>{hero.title}</h1>
          <p>{hero.text}</p>
          <div
            className="segmented portal-tabs"
            role="tablist"
            aria-label="Secciones del portal"
          >
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className="segmented__option"
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="layout">
        <div className="layout__main">
          {/* Oculto y no desmontado: así no se pierden las ediciones al ver pedidos. */}
          <div hidden={section !== 'menu'}>{renderMenuSection()}</div>
          {section === 'orders' && <OrdersView token={session.token} />}
        </div>

        <aside className="layout__aside">
          {section === 'menu' && view === 'review' ? (
            <OriginalMenuPreview files={files} />
          ) : (
            <>
              <div className="promo-card">
                <span className="promo-card__label">Agente virtual</span>
                <p className="promo-card__title">Atiende 24/7 sin contestar tú</p>
                <div className="chat" aria-hidden="true">
                  <span className="chat__bubble chat__bubble--in">
                    Hola, quiero pedir en Arepera La Esquina
                  </span>
                  <span className="chat__bubble chat__bubble--out">
                    ¡Claro! Este es su menú de hoy. ¿Qué te anoto? 🫓
                  </span>
                </div>
              </div>

              <section className="card how-card">
                <h2>¿Cómo funciona?</h2>
                <ul className="tiles">
                  {HOW_IT_WORKS.map((item) => (
                    <li key={item.title} className="tile">
                      <span className={`tile__icon tile__icon--${item.tone}`}>
                        {item.icon}
                      </span>
                      <span>
                        <span className="tile__title">{item.title}</span>
                        <span className="tile__text">{item.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </aside>
      </main>

      <Footer />
    </>
  )
}
