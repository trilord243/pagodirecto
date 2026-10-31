import QRCode from 'qrcode';
import sharp from 'sharp';

const WIDTH = 1080;
const ROW_HEIGHT = 120;
const HEADER_HEIGHT = 250;
const FOOTER_HEIGHT = 110;
const MAX_NAME_LENGTH = 34;
const MAX_RESTAURANTS = 20;

const NAVY = '#050b26';
const PINK = '#ff0060';
const MUTED = '#5b6280';
const BORDER = '#e3e6f2';

const QR_SIZE = 720;
const QR_LOGO_SIZE = 160;
// La "P" de PagoDirecto, la misma del favicon del portal.
const LOGO_MARK =
  'M30.914 2.31277L27.5307 0.297493V11.3431C24.65 9.15511 21.054 7.85958 17.1487 7.85958C7.73333 7.85958 0.087 15.4025 0 24.7303V49.1535L3.38333 47.1383L6.76667 49.1535V38.4438C9.64733 40.6222 13.2433 41.9177 17.1487 41.9177C26.5543 41.9177 34.191 34.4036 34.2973 25.095V0.297493L30.914 2.31277ZM17.1487 35.2002C11.4163 35.2002 6.76667 30.5842 6.76667 24.8935C6.76667 19.2027 11.4163 14.5772 17.1487 14.5772C22.881 14.5772 27.5403 19.1931 27.5403 24.8935C27.5403 30.5938 22.8907 35.2002 17.1487 35.2002Z';
const QR_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="${QR_LOGO_SIZE}" height="${QR_LOGO_SIZE}" viewBox="0 0 80 80">
  <rect width="80" height="80" rx="16" fill="#ffffff"/>
  <path transform="translate(22.5 15)" fill="${PINK}" d="${LOGO_MARK}"/>
</svg>`;

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shorten(text: string): string {
  return text.length > MAX_NAME_LENGTH
    ? `${text.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`
    : text;
}

// La corrección máxima deja leer el QR aunque el logo tape los módulos del
// centro: admite perder hasta un 30 % y el logo ocupa menos del 6 %.
export async function renderQr(url: string): Promise<Buffer> {
  const qr = await QRCode.toBuffer(url, {
    type: 'png',
    width: QR_SIZE,
    margin: 3,
    errorCorrectionLevel: 'H',
  });
  return sharp(qr)
    .composite([{ input: Buffer.from(QR_LOGO), gravity: 'center' }])
    .png()
    .toBuffer();
}

const CARD_COLUMNS = 5;
const CARD_EYE_SIZE = 150;
const CARD_EYE_GAP = 38;

// Cada compra llena uno de los "ojitos": el circulo de la P de PagoDirecto.
function renderEye(x: number, y: number, filled: boolean): string {
  const radius = CARD_EYE_SIZE / 2;
  const center = `cx="${x + radius}" cy="${y + radius}"`;
  return filled
    ? `<circle ${center} r="${radius}" fill="${PINK}"/>
       <circle ${center} r="${radius * 0.42}" fill="${NAVY}"/>`
    : `<circle ${center} r="${radius - 4}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="8"/>`;
}

export interface LoyaltyCardImage {
  restaurant: string;
  stamps: number;
  stampsRequired: number;
  rewardName: string;
  rewardsAvailable: number;
}

export async function renderLoyaltyCard({
  restaurant,
  stamps,
  stampsRequired,
  rewardName,
  rewardsAvailable,
}: LoyaltyCardImage): Promise<Buffer> {
  const rows = Math.ceil(stampsRequired / CARD_COLUMNS);
  const eyesTop = 300;
  const height =
    eyesTop + rows * (CARD_EYE_SIZE + CARD_EYE_GAP) + 150;
  const eyes = Array.from({ length: stampsRequired }, (_, index) =>
    renderEye(
      72 + (index % CARD_COLUMNS) * (CARD_EYE_SIZE + CARD_EYE_GAP),
      eyesTop + Math.floor(index / CARD_COLUMNS) * (CARD_EYE_SIZE + CARD_EYE_GAP),
      index < stamps,
    ),
  ).join('');
  const missing = stampsRequired - stamps;
  const footer =
    rewardsAvailable > 0
      ? `¡Tienes tu premio listo: ${rewardName}!`
      : `Te ${missing === 1 ? 'falta' : 'faltan'} ${missing} para tu premio: ${rewardName}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" font-family="DejaVu Sans, sans-serif">
    <rect width="${WIDTH}" height="${height}" fill="${NAVY}"/>
    <text x="72" y="96" font-size="34" font-weight="bold" fill="${PINK}">PagoDirecto</text>
    <text x="72" y="178" font-size="54" font-weight="bold" fill="#ffffff">${escapeXml(shorten(restaurant))}</text>
    <text x="72" y="236" font-size="32" fill="#c7cce3">Tarjeta de fidelidad: ${stamps} de ${stampsRequired}</text>
    ${eyes}
    <text x="72" y="${height - 72}" font-size="32" font-weight="bold" fill="#ffffff">${escapeXml(footer.slice(0, 54))}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderRestaurantsImage(
  restaurants: { id: string; name: string }[],
): Promise<Buffer> {
  const shown = restaurants.slice(0, MAX_RESTAURANTS);
  const height = HEADER_HEIGHT + shown.length * ROW_HEIGHT + FOOTER_HEIGHT;
  const rows = shown
    .map((restaurant, index) => {
      const top = HEADER_HEIGHT + index * ROW_HEIGHT;
      return `
        <text x="72" y="${top + 56}" font-size="42" font-weight="bold" fill="${NAVY}">${escapeXml(shorten(restaurant.name))}</text>
        <text x="72" y="${top + 96}" font-size="28" fill="${MUTED}">ID ${escapeXml(restaurant.id)}</text>
        <rect x="72" y="${top + ROW_HEIGHT - 1}" width="${WIDTH - 144}" height="2" fill="${BORDER}"/>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" font-family="DejaVu Sans, sans-serif">
    <rect width="${WIDTH}" height="${height}" fill="#ffffff"/>
    <rect width="${WIDTH}" height="${HEADER_HEIGHT - 40}" fill="${NAVY}"/>
    <text x="72" y="84" font-size="34" font-weight="bold" fill="${PINK}">PagoDirecto</text>
    <text x="72" y="154" font-size="54" font-weight="bold" fill="#ffffff">Restaurantes afiliados</text>
    ${rows}
    <text x="72" y="${height - 44}" font-size="30" fill="${MUTED}">Escríbeme el nombre o el ID para ver su menú</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
