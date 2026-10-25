import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { buildWatermarkLines, WatermarkContext } from './watermark';

export function diagonalWatermarkSize(width: number, height: number): number {
  return Math.min(18, Math.max(13, Math.min(width, height) * 0.026));
}

export async function watermarkPdf(
  source: Buffer,
  context: WatermarkContext,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(source);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = buildWatermarkLines(context);
  const footer = lines.join('   |   ');

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    drawPageWatermark(page, font, lines, footer, width, height);
  }

  return Buffer.from(await pdf.save());
}

function drawPageWatermark(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  footer: string,
  width: number,
  height: number,
) {
  const size = diagonalWatermarkSize(width, height);
  const color = rgb(0.45, 0.38, 0.34);
  const maxLineWidth = Math.min(width, height) * 0.78;
  const lineHeight = size * 1.2;
  const originX = width * 0.16;
  const originY = height * 0.46;

  lines.forEach((line, index) => {
    const fitted = fitFontSize(font, line, maxLineWidth, size, 11);
    page.drawText(line, {
      x: originX,
      y: originY - index * lineHeight,
      size: fitted,
      font,
      color,
      opacity: 0.22,
      rotate: degrees(28),
    });
  });

  const footerSize = 8;
  const footerText = truncateToWidth(font, footer, width - 48, footerSize);
  page.drawText(footerText, {
    x: 24,
    y: 16,
    size: footerSize,
    font,
    color: rgb(0.32, 0.28, 0.24),
    opacity: 0.55,
  });
}

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferred: number,
  minimum: number,
): number {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

function truncateToWidth(
  font: PDFFont,
  text: string,
  maxWidth: number,
  size: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }
  let next = text;
  while (next.length > 4 && font.widthOfTextAtSize(`${next}…`, size) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

export async function applySignaturePng(
  source: Buffer,
  png: Buffer,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(source);
  const image = await pdf.embedPng(png);
  const page = pdf.getPages()[pdf.getPageCount() - 1];
  const { width } = page.getSize();
  const sigWidth = 168;
  const ratio = image.height / image.width;
  const sigHeight = Math.min(72, sigWidth * ratio);
  page.drawImage(image, {
    x: width - sigWidth - 40,
    y: 40,
    width: sigWidth,
    height: sigHeight,
  });
  return Buffer.from(await pdf.save());
}

export function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}
