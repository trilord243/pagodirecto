import { useEffect, useRef, useState } from 'react'
import { Footer } from './components/Footer.tsx'
import { Header } from './components/Header.tsx'
import { AdvisorView } from './components/AdvisorView.tsx'
import { CatalogView } from './components/CatalogView.tsx'
import { BagIcon, ChatIcon, MenuIcon, ScanIcon } from './components/Icons.tsx'
import { LoadState } from './components/LoadState.tsx'
import { LoyaltyView } from './components/LoyaltyView.tsx'
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
  createCategory,
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
  manual: {
    title: 'Crea tu menú',
    text: 'Agrega tus productos uno por uno. Tus clientes verán exactamente esto en WhatsApp.',
  },
  catalog: {
    title: 'Tu catálogo',
    text: 'Todos tus platos, uno por uno, con su precio y si están disponibles.',
  },
  review: {
    title: 'Revisa y ajusta tu menú',
    text: 'Corrige nombres, precios y disponibilidad. Tus clientes verán exactamente esto en WhatsApp.',
  },
  orders: {
    title: 'Tus pedidos',
    text: 'Confirma cada pedido, avísale al cliente cuándo está listo y marca lo que ya te pagaron.',
  },
  loyalty: {
    title: 'Haz que tus clientes vuelvan',
    text: 'Premia cada compra con tu tarjeta de fidelidad y crea promociones para quienes más te compran.',
  },
  advisor: {
    title: 'Tu asesor de negocio',
    text: 'Analiza tus ventas y te dice qué mejorar y qué promociones crear.',
  },
}

const SECTIONS = [
  { id: 'menu', label: 'Menú' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'loyalty', label: 'Fidelidad' },
  { id: 'advisor', label: 'Asesor' },
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
  // Se monta la primera vez que se abre y ya no se quita: el análisis tarda.
  const [advisorOpened, setAdvisorOpened] = useState(false)
  const [view, setView] = useState<View>('loading')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  // El menú activo en el servidor; null si el comercio aún no publica ninguno.
  const [published, setPublished] = useState<EditableMenu | null>(null)
  // El último envío: sus archivos y lo que se leyó de ellos.
  const [files, setFiles] = useState<File[]>([])
  const [menu, setMenu] = useState<EditableMenu | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('scanning')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const activeUpload = useRef<AbortController | null>(null)
  const tabs = useRef<HTMLDivElement>(null)

  // En un teléfono angosto la pestaña abierta puede quedar fuera de la barra.
  useEffect(() => {
    const bar = tabs.current
    const tab = bar?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!bar || !tab) return
    bar.scrollTo({
      left: tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [section])

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
    setUploadPercent(0)
    setStage('uploading')
    setView('status')
    scrollToTop()

    try {
      const scanned = await analyzeMenu(
        session.token,
        next,
        (percent) => {
          setUploadPercent(percent)
          if (percent === 100) setStage('scanning')
        },
        controller.signal,
      )
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
      setUploadError(errorMessage(error))
      setView('upload')
    }
  }

  function handleReset() {
    activeUpload.current?.abort()
    setFiles([])
    setMenu(null)
    setUploadError(null)
    setView('upload')
    scrollToTop()
  }

  // Sin archivos: el editor arranca vacío y el comercio escribe cada producto.
  function openManual() {
    setFiles([])
    setMenu({ currency: 'USD', categories: [createCategory()] })
    setStage('ready')
    setUploadError(null)
    setView('review')
    scrollToTop()
  }

  async function handlePublish(next: EditableMenu) {
    const saved = await publishMenu(session.token, next)
    setPublished(saved)
    if (view === 'review') {
      setMenu(saved)
      setStage('published')
      setView(files.length > 0 ? 'status' : 'home')
      scrollToTop()
    }
    return saved
  }

  function openUpload() {
    setView('upload')
    scrollToTop()
  }

  function openSection(next: Section) {
    setSection(next)
    if (next === 'advisor') setAdvisorOpened(true)
  }

  function renderLoadState() {
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
    return null
  }

  function renderMenuSection() {
    const loadState = renderLoadState()
    if (loadState) return loadState
    if (view === 'upload') {
      return (
        <MenuUploadForm
          initialFiles={files}
          serverError={uploadError}
          onCancel={() => {
            setUploadError(null)
            setView('home')
          }}
          onManual={openManual}
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
          uploadPercent={uploadPercent}
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
          accountName={session.name}
          initialMenu={menu}
          published={stage === 'published'}
          hasOriginal={files.length > 0}
          replacesPublished={published !== null}
          cancelLabel="Volver"
          onCancel={() => {
            setView(files.length > 0 ? 'status' : 'home')
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
          accountName={session.name}
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
    return (
      <Welcome session={session} onUpload={openUpload} onManual={openManual} />
    )
  }

  function menuHeroKey(): keyof typeof HERO_COPY {
    if (view === 'upload') return 'upload'
    if (view === 'review') return files.length > 0 ? 'review' : 'manual'
    if (view === 'status') return stage === 'published' ? 'published' : 'status'
    return view === 'home' && published ? 'published' : 'welcome'
  }

  const hero = HERO_COPY[section === 'menu' ? menuHeroKey() : section]
  const currency = published?.currency ?? 'USD'

  return (
    <>
      <div className="hero">
        <Header session={session} onLogout={onLogout} />
        <div className="hero__content">
          <span className="hero__eyebrow">Pedidos por WhatsApp</span>
          <h1>{hero.title}</h1>
          <p>{hero.text}</p>
          <div
            ref={tabs}
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
                onClick={() => openSection(id)}
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
          {section === 'catalog' &&
            (renderLoadState() ?? (
              <CatalogView menu={published} onEdit={() => setSection('menu')} />
            ))}
          {section === 'orders' && <OrdersView token={session.token} />}
          {section === 'loyalty' &&
            (renderLoadState() ?? (
              <LoyaltyView
                token={session.token}
                businessName={session.name}
                currency={currency}
                onEditMenu={() => setSection('menu')}
              />
            ))}
          {advisorOpened && (
            <div hidden={section !== 'advisor'}>
              <AdvisorView
                token={session.token}
                currency={currency}
                visible={section === 'advisor'}
              />
            </div>
          )}
        </div>

        <aside className="layout__aside">
          {section === 'menu' && view === 'review' && files.length > 0 ? (
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
