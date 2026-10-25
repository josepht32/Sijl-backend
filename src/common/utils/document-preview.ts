import { extname } from 'path';
import MarkdownIt = require('markdown-it');
import mammoth = require('mammoth');
import {
  escapeHtml,
  htmlToPdf,
  sanitizeComposedHtml,
} from './html-to-pdf';

export type PreviewKind = 'pdf' | 'text' | 'markdown' | 'docx' | 'image';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

export function fileExtension(fileName: string): string {
  return extname(fileName || '').toLowerCase();
}

export function previewKind(mimeType: string, fileName: string): PreviewKind | null {
  const mime = (mimeType || '').toLowerCase();
  const ext = fileExtension(fileName);

  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime === 'application/pdf' || ext === '.pdf') {
    return 'pdf';
  }
  if (
    ext === '.md' ||
    ext === '.markdown' ||
    mime === 'text/markdown' ||
    mime === 'text/x-markdown'
  ) {
    return 'markdown';
  }
  if (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (ext === '.txt' || mime === 'text/plain') {
    return 'text';
  }
  return null;
}

export function canConvertToPdf(mimeType: string, fileName: string): boolean {
  const kind = previewKind(mimeType, fileName);
  return kind === 'text' || kind === 'markdown' || kind === 'docx';
}

export function previewAsPdf(mimeType: string, fileName: string): boolean {
  const kind = previewKind(mimeType, fileName);
  return kind === 'pdf' || canConvertToPdf(mimeType, fileName);
}

export function looksLikeArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

export function textToPreviewHtml(text: string, title: string): string {
  return `<h1>${escapeHtml(title)}</h1><pre class="plain-text">${escapeHtml(text)}</pre>`;
}

export function markdownToPreviewHtml(source: string, title: string): string {
  const body = markdown.render(source || '');
  return `<h1>${escapeHtml(title)}</h1>${sanitizeComposedHtml(body)}`;
}

export async function docxToPreviewHtml(buffer: Buffer, title: string): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer },
    { convertImage: mammoth.images.dataUri },
  );
  return `<h1>${escapeHtml(title)}</h1>${sanitizeComposedHtml(result.value || '')}`;
}

export async function renderPreviewPdf(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<Buffer> {
  const kind = previewKind(mimeType, fileName);
  const title = fileName.replace(/\.[^.]+$/, '') || fileName;
  let html = '';
  let source = '';
  if (kind === 'text') {
    source = buffer.toString('utf8');
    html = textToPreviewHtml(source, title);
  } else if (kind === 'markdown') {
    source = buffer.toString('utf8');
    html = markdownToPreviewHtml(source, title);
  } else if (kind === 'docx') {
    html = await docxToPreviewHtml(buffer, title);
    source = html;
  } else {
    throw new Error('This file type cannot be previewed as PDF');
  }
  return htmlToPdf(html, { title, rtl: looksLikeArabic(source) });
}
