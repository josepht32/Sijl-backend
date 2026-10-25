import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractDocumentText } from './document-text';

describe('extractDocumentText', () => {
  it('reads plain text and the file name', () => {
    const text = extractDocumentText(
      Buffer.from('Annex packing list for the Giza warehouse'),
      'text/plain',
      'giza-warehouse-annex.txt',
    );
    expect(text).toContain('Giza warehouse');
    expect(text).toContain('giza warehouse annex');
  });

  it('extracts drawn PDF text', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([420, 560]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Arab Contractors payment schedule', { x: 36, y: 500, size: 12, font });
    const bytes = Buffer.from(await pdf.save());
    const text = extractDocumentText(bytes, 'application/pdf', 'payment-schedule.pdf');
    expect(text.toLowerCase()).toContain('arab contractors');
  });

  it('finishes quickly on binary PDF noise', () => {
    const noise = Buffer.from(`${'('.repeat(20_000)}stream\n\u0000\u0001endstream`);
    const started = Date.now();
    const text = extractDocumentText(noise, 'application/pdf', 'noise.pdf');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(text.toLowerCase()).toContain('noise');
  });
});

