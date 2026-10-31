import { useRef, useState } from 'react'
import { Footer } from './components/Footer.tsx'
import { Header } from './components/Header.tsx'
import { BagIcon, ChatIcon, MenuIcon, ScanIcon } from './components/Icons.tsx'
import { MenuEditor } from './components/MenuEditor.tsx'
import { MenuUploadForm } from './components/MenuUploadForm.tsx'
import { OriginalMenuPreview } from './components/OriginalMenuPreview.tsx'
import {
  SubmissionStatus,
  type ProcessingStage,
} from './components/SubmissionStatus.tsx'
import { Welcome } from './components/Welcome.tsx'
import { countItems, scanMenu, type ScannedMenu } from './lib/menu.ts'
import type { Session } from './lib/auth.ts'
import type { MenuSubmission } from './lib/menuUpload.ts'

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
}

type View = 'welcome' | 'upload' | 'status' | 'review'

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

interface PortalProps {
  session: Session
  onLogout: () => void
}

export function Portal({ session, onLogout }: PortalProps) {
  const [submission, setSubmission] = useState<MenuSubmission | null>(null)
  const [menu, setMenu] = useState<ScannedMenu | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('scanning')
  const [view, setView] = useState<View>('welcome')
  // Evita que un escaneo de un envío anterior pise el estado actual.
  const activeSubmissionId = useRef<string | null>(null)

  async function handleSubmitted(next: MenuSubmission) {
    activeSubmissionId.current = next.id
    setSubmission(next)
    setMenu(null)
    setStage('scanning')
    setView('status')
    scrollToTop()

    const scanned = await scanMenu()
    if (activeSubmissionId.current !== next.id) return
    setMenu(scanned)
    setStage('ready')
  }

  function handleReset() {
    activeSubmissionId.current = null
    setSubmission(null)
    setMenu(null)
    setView('upload')
    scrollToTop()
  }

  function handlePublish(next: ScannedMenu) {
    setMenu(next)
    setStage('published')
    setView('status')
    scrollToTop()
  }

  const hero =
    HERO_COPY[view === 'status' && stage === 'published' ? 'published' : view]

  return (
    <>
      <div className="hero">
        <Header session={session} onLogout={onLogout} />
        <div className="hero__content">
          <span className="hero__eyebrow">Pedidos por WhatsApp</span>
          <h1>{hero.title}</h1>
          <p>{hero.text}</p>
        </div>
      </div>

      <main className="layout">
        <div className="layout__main">
          {submission && menu && view === 'review' ? (
            <MenuEditor
              accountName={session.username}
              initialMenu={menu}
              published={stage === 'published'}
              onCancel={() => {
                setView('status')
                scrollToTop()
              }}
              onPublish={handlePublish}
            />
          ) : submission ? (
            <SubmissionStatus
              submission={submission}
              stage={stage}
              productCount={menu ? countItems(menu).total : 0}
              onReview={() => {
                setView('review')
                scrollToTop()
              }}
              onReset={handleReset}
            />
          ) : view === 'upload' ? (
            <MenuUploadForm
              restaurantId={session.restaurantId}
              onCancel={() => setView('welcome')}
              onSubmitted={handleSubmitted}
            />
          ) : (
            <Welcome
              session={session}
              onUpload={() => {
                setView('upload')
                scrollToTop()
              }}
            />
          )}
        </div>

        <aside className="layout__aside">
          {submission && view === 'review' ? (
            <OriginalMenuPreview files={submission.files} />
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
