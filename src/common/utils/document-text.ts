import { inflateRawSync, inflateSync } from 'zlib';

const MAX_EXTRACTED_CHARS = 50_000;
const MAX_PDF_SCAN_CHARS = 1_500_000;
const MAX_STREAMS = 40;
const MAX_MATCHES = 400;
const MAX_LITERAL = 800;

export function htmlToPlainText(html: string): string {
  if (!html) {
    return '';
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): string {
  const parts = [fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')];
  const mime = (mimeType || '').toLowerCase();

  if (mime === 'text/plain' || mime.startsWith('text/')) {
    parts.push(buffer.toString('utf8'));
  } else if (mime === 'application/pdf') {
    parts.push(extractPdfText(buffer));
  }

  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_EXTRACTED_CHARS);
}

function extractPdfText(buffer: Buffer): string {
  const slice =
    buffer.length > MAX_PDF_SCAN_CHARS
      ? buffer.subarray(0, MAX_PDF_SCAN_CHARS)
      : buffer;
  const raw = slice.toString('latin1');
  const inflated: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]{0,500000}?)endstream/g;
  let streams = 0;
  for (const match of boundedMatchAll(raw, streamPattern)) {
    inflated.push(inflatePdfStream(Buffer.from(match[1], 'latin1')));
    streams += 1;
    if (streams >= MAX_STREAMS) {
      break;
    }
  }
  return collectPdfStrings(
    [raw, ...inflated].join('\n').slice(0, MAX_PDF_SCAN_CHARS),
  );
}

function inflatePdfStream(bytes: Buffer): string {
  const payload =
    bytes[bytes.length - 1] === 0x0a || bytes[bytes.length - 1] === 0x0d
      ? bytes.subarray(
          0,
          bytes.length - (bytes[bytes.length - 2] === 0x0d ? 2 : 1),
        )
      : bytes;
  try {
    return inflateSync(payload).toString('latin1');
  } catch {
    try {
      return inflateRawSync(payload).toString('latin1');
    } catch {
      return '';
    }
  }
}

function collectPdfStrings(raw: string): string {
  const chunks: string[] = [];

  const title = raw.match(/\/Title\s*\((?:\\.|[^\\)]){0,800}\)/);
  if (title) {
    chunks.push(decodePdfLiteral(title[0].slice(title[0].indexOf('(') + 1, -1)));
  }

  const hexTitle = raw.match(/\/Title\s*<([0-9A-Fa-f\s]{4,800})>/);
  if (hexTitle) {
    chunks.push(decodePdfHex(hexTitle[1]));
  }

  for (const match of boundedMatchAll(
    raw,
    new RegExp(`\\((?:\\\\.|[^\\\\)]){0,${MAX_LITERAL}}\\)[ \\t]*Tj`, 'g'),
  )) {
    const inner = match[0].replace(/[ \t]*Tj$/, '').slice(1, -1);
    chunks.push(decodePdfLiteral(inner));
  }

  for (const match of boundedMatchAll(raw, /\[[^\]]{0,4000}\][ \t]*TJ/g)) {
    for (const piece of boundedMatchAll(
      match[0],
      new RegExp(`\\((?:\\\\.|[^\\\\)]){0,${MAX_LITERAL}}\\)`, 'g'),
    )) {
      chunks.push(decodePdfLiteral(piece[0].slice(1, -1)));
    }
  }

  for (const match of boundedMatchAll(
    raw,
    /<([0-9A-Fa-f\s]{8,800})>[ \t]*Tj/g,
  )) {
    chunks.push(decodePdfHex(match[1]));
  }

  return chunks.filter(Boolean).join(' ');
}

function* boundedMatchAll(input: string, pattern: RegExp): Generator<RegExpExecArray> {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match = regex.exec(input);
  let count = 0;
  while (match) {
    yield match;
    count += 1;
    if (count >= MAX_MATCHES) {
      return;
    }
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
    match = regex.exec(input);
  }
}

function decodePdfLiteral(value: string): string {
  const unescaped = value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, ' ')
    .replace(/\\f/g, ' ')
    .replace(/\\([0-7]{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8)),
    )
    .replace(/\\([()\\])/g, '$1');

  if (unescaped.charCodeAt(0) === 0xfe && unescaped.charCodeAt(1) === 0xff) {
    return decodeUtf16Be(Buffer.from(unescaped, 'latin1'));
  }
  return unescaped;
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length < 4 || clean.length % 2) {
    return '';
  }
  const bytes = Buffer.from(clean, 'hex');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString('utf16le').replace(/^\uFEFF/, '');
  }
  return bytes.toString('latin1');
}

function decodeUtf16Be(bytes: Buffer): string {
  const swapped = Buffer.alloc(bytes.length);
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1];
    swapped[index + 1] = bytes[index];
  }
  return swapped.toString('utf16le').replace(/^\uFEFF/, '');
}
