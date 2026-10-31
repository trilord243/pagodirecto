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

export function renderQr(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: 'png',
    width: 720,
    margin: 3,
    errorCorrectionLevel: 'M',
  });
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
