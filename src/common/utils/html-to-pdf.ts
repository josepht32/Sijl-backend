import { existsSync } from 'fs';
import * as puppeteer from 'puppeteer';
import * as sanitizeHtml from 'sanitize-html';
import { htmlToPlainText } from './document-text';

const sanitize = (
  typeof sanitizeHtml === 'function'
    ? sanitizeHtml
    : (sanitizeHtml as { default: typeof sanitizeHtml }).default
) as typeof sanitizeHtml;

export function htmlHasContent(html: string): boolean {
  if (!html) {
    return false;
  }
  if (/<img\b/i.test(html)) {
    return true;
  }
  return htmlToPlainText(html).length > 0;
}

export function sanitizeComposedHtml(html: string): string {
  return sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'span',
      'font',
      'u',
      's',
      'strike',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'caption',
      'colgroup',
      'col',
      'hr',
      'sup',
      'sub',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      ...sanitize.defaults.allowedAttributes,
      '*': ['style', 'class', 'dir', 'align', 'lang'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      td: ['colspan', 'rowspan', 'width', 'height', 'style', 'align'],
      th: ['colspan', 'rowspan', 'width', 'height', 'style', 'align'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'style'],
      col: ['span', 'width', 'style'],
      font: ['color', 'size', 'face'],
    },
    allowedStyles: {
      '*': {
        color: [/.*/],
        'background-color': [/.*/],
        'text-align': [/.*/],
        'font-size': [/.*/],
        'font-family': [/.*/],
        'font-weight': [/.*/],
        'font-style': [/.*/],
        'text-decoration': [/.*/],
        'line-height': [/.*/],
        margin: [/.*/],
        padding: [/.*/],
        width: [/.*/],
        height: [/.*/],
        'max-width': [/.*/],
        border: [/.*/],
        'border-collapse': [/.*/],
        direction: [/.*/],
      },
    },
    allowedSchemes: ['http', 'https', 'data', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
  });
}

export function safeDocumentFileName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'document';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml(html: string, options: { title: string; rtl: boolean }): string {
  const dir = options.rtl ? 'rtl' : 'ltr';
  const lang = options.rtl ? 'ar' : 'en';
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap"
    rel="stylesheet"
  />
  <style>
    @page { size: A4; }
    html, body {
      margin: 0;
      padding: 0;
      color: #1b1814;
      font-family: "IBM Plex Sans Arabic", "IBM Plex Sans", "Segoe UI", Tahoma, sans-serif;
      font-size: 14px;
      line-height: 1.65;
    }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #c9beab; padding: 6px 8px; vertical-align: top; }
    h1, h2, h3, h4 { line-height: 1.3; margin: 0 0 0.6em; }
    p { margin: 0 0 0.75em; }
    pre, .plain-text {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "IBM Plex Sans", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
  </style>
</head>
<body>${html}</body>
</html>`;
}

function chromeExecutable(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    puppeteer.executablePath?.(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((path) => path && existsSync(path));
}

export async function htmlToPdf(
  html: string,
  options: { title: string; rtl: boolean },
): Promise<Buffer> {
  const executablePath = chromeExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=medium',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(wrapHtml(html, options), {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    try {
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Continue with fallback fonts if the webfont wait fails.
    }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:9px;width:100%;text-align:center;color:#5b564c;font-family:sans-serif;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
      margin: { top: '16mm', right: '16mm', bottom: '18mm', left: '16mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
