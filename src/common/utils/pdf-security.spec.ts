import { PDFDocument, StandardFonts } from 'pdf-lib';
import { diagonalWatermarkSize, watermarkPdf } from './pdf-security';

describe('pdf watermark', () => {
  it('keeps a single modest stamp on letter paper', () => {
    const letter = diagonalWatermarkSize(612, 792);
    const a4 = diagonalWatermarkSize(595.28, 841.89);
    expect(letter).toBeGreaterThanOrEqual(13);
    expect(letter).toBeLessThanOrEqual(18);
    expect(a4).toBeGreaterThanOrEqual(13);
    expect(a4).toBeLessThanOrEqual(18);
  });

  it('stamps a readable watermark onto a letter-size page', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Official correspondence', { x: 72, y: 720, size: 14, font });
    const source = Buffer.from(await pdf.save());
    const watermarked = await watermarkPdf(source, {
      email: 'nora@sijil.local',
      traceCode: 'DL-ABCDEF1234',
      downloadedAt: new Date('2026-10-12T12:00:00Z'),
    });
    expect(watermarked.subarray(0, 4).toString()).toBe('%PDF');
    expect(watermarked.length).toBeGreaterThan(source.length);
    const loaded = await PDFDocument.load(watermarked);
    expect(loaded.getPageCount()).toBe(1);
  });
});
