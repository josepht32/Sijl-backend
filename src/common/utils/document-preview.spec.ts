import {
  canConvertToPdf,
  markdownToPreviewHtml,
  previewKind,
  textToPreviewHtml,
} from './document-preview';

describe('document preview conversion', () => {
  it('classifies txt, markdown, and docx as PDF preview sources', () => {
    expect(previewKind('text/plain', 'note.txt')).toBe('text');
    expect(previewKind('text/plain', 'brief.md')).toBe('markdown');
    expect(previewKind('text/markdown', 'brief.md')).toBe('markdown');
    expect(
      previewKind(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'memo.docx',
      ),
    ).toBe('docx');
    expect(canConvertToPdf('text/plain', 'note.txt')).toBe(true);
    expect(canConvertToPdf('application/pdf', 'scan.pdf')).toBe(false);
  });

  it('renders plain text and markdown as letter HTML', () => {
    const text = textToPreviewHtml('Missing annex for the Giza file.', 'Warehouse note');
    expect(text).toContain('<pre class="plain-text">');
    expect(text).toContain('Missing annex for the Giza file.');
    expect(text).toContain('Warehouse note');

    const markdown = markdownToPreviewHtml(
      '# Studies note\n\nPlease **return** the file.',
      'Studies note',
    );
    expect(markdown).toContain('<h1>');
    expect(markdown).toContain('<strong>return</strong>');
  });
});
