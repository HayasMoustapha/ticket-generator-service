const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');

function clampNumber(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return min;
  }

  return Math.min(Math.max(numericValue, min), max);
}

function hashBufferSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

class HtmlTemplateService {
  collectPdfKitBuffer(doc) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  wrapExactPngInPdf({ pngBuffer, pngSha256, width, height }) {
    const pageWidth = width * 0.75;
    const pageHeight = height * 0.75;
    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      info: {
        Title: 'Event Ticket',
        Author: 'Event Planner',
        Subject: `exact-raster-sha256:${pngSha256}`,
        Keywords: `exact-raster-sha256:${pngSha256}`,
        Creator: 'Event Planner Ticket Generator'
      }
    });
    const pdfBufferPromise = this.collectPdfKitBuffer(doc);

    doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });
    doc.image(pngBuffer, 0, 0, { width: pageWidth, height: pageHeight });
    doc.end();

    return pdfBufferPromise;
  }

  async waitForRenderableResources(page) {
    await page.evaluate(async () => {
      const cssBackgroundUrls = Array.from(document.querySelectorAll('*')).flatMap((element) => {
        const backgroundImage = window.getComputedStyle(element).backgroundImage;
        if (!backgroundImage || backgroundImage === 'none') {
          return [];
        }

        const matches = backgroundImage.matchAll(/url\((['"]?)(.*?)\1\)/g);
        return Array.from(matches, (match) => match[2]).filter(Boolean);
      });

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      await Promise.all([
        ...Array.from(document.images).map((image) => {
          if (image.complete) {
            return Promise.resolve();
          }

          return new Promise((resolve) => {
            const finish = () => resolve();
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
          });
        }),
        ...cssBackgroundUrls.map((url) => new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = url;
        })),
      ]);
    });
  }

  parseSvgDimensions(svgMarkup) {
    const viewBoxMatch = svgMarkup.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/i);
    if (viewBoxMatch) {
      return {
        width: Number(viewBoxMatch[1]) || null,
        height: Number(viewBoxMatch[2]) || null,
      };
    }

    const widthHeightMatch = svgMarkup.match(/width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/i);
    if (widthHeightMatch) {
      return {
        width: Number(widthHeightMatch[1]) || null,
        height: Number(widthHeightMatch[2]) || null,
      };
    }

    const heightWidthMatch = svgMarkup.match(/height="(\d+(?:\.\d+)?)"[^>]*width="(\d+(?:\.\d+)?)"/i);
    if (!heightWidthMatch) {
      return { width: null, height: null };
    }

    return {
      width: Number(heightWidthMatch[2]) || null,
      height: Number(heightWidthMatch[1]) || null,
    };
  }

  async renderTemplateToPdf(htmlContent, options = {}) {
    // Rendu HTML → PDF via Chromium headless (puppeteer)
    const { width, height } = options;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      if (width && height) {
        await page.setViewport({ width, height });
      }

      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Forcer un rendu aligné sur le preview (pas de débordement)
      if (width && height) {
        await page.addStyleTag({
          content: `
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: ${width}px !important;
              height: ${height}px !important;
              overflow: hidden !important;
            }
            body > * {
              max-width: ${width}px;
              max-height: ${height}px;
            }
          `
        });
      }

      await page.emulateMediaType('screen');
      const pdfBuffer = await page.pdf({
        printBackground: true,
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        format: width && height ? undefined : 'A4'
      });

      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }

  async renderSvgToPdf(svgMarkup, options = {}) {
    const dimensions = this.parseSvgDimensions(svgMarkup);
    const width = options.width || dimensions.width;
    const height = options.height || dimensions.height;

    return this.renderTemplateToPdf(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: ${width || 760}px;
              height: ${height || 420}px;
              overflow: hidden;
              background: transparent;
            }
            body > svg {
              display: block;
              width: 100%;
              height: 100%;
            }
          </style>
        </head>
        <body>
          ${svgMarkup}
        </body>
      </html>`,
      { width, height },
    );
  }

  async renderTemplateToExactRasterPdf(htmlContent, options = {}) {
    const width = Math.round(options.width || 760);
    const height = Math.round(options.height || 420);
    const scale = Math.round(clampNumber(options.scale || 1, 1, 4));

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: scale });
      await page.emulateMediaType('screen');
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await this.waitForRenderableResources(page);

      const pngBuffer = Buffer.from(await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
        captureBeyondViewport: false,
        omitBackground: false
      }));
      const pngSha256 = hashBufferSha256(pngBuffer);
      const pdfBuffer = await this.wrapExactPngInPdf({
        pngBuffer,
        pngSha256,
        width,
        height
      });

      return {
        pdfBuffer,
        pngBuffer,
        pngSha256,
        width,
        height,
        scale
      };
    } finally {
      await browser.close();
    }
  }

  async renderSvgToExactRasterPdf(svgMarkup, options = {}) {
    const dimensions = this.parseSvgDimensions(svgMarkup);
    const width = options.width || dimensions.width || 760;
    const height = options.height || dimensions.height || 420;

    return this.renderTemplateToExactRasterPdf(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: ${width}px;
              height: ${height}px;
              overflow: hidden;
              background: transparent;
            }
            body > svg {
              display: block;
              width: 100%;
              height: 100%;
            }
          </style>
        </head>
        <body>
          ${svgMarkup}
        </body>
      </html>`,
      { width, height, scale: options.scale },
    );
  }

  async prepareTemplate(sourceFilesPath) {
    if (!sourceFilesPath) {
      throw new Error('source_files_path manquant pour le template');
    }

    const workingDir = path.join(os.tmpdir(), `ticket-template-${crypto.randomUUID()}`);
    await fs.mkdir(workingDir, { recursive: true });

    let templateRoot = workingDir;
    const resolvedPath = path.resolve(sourceFilesPath);
    const stat = await fs.stat(resolvedPath);

    if (stat.isDirectory()) {
      // Template déjà extrait
      templateRoot = resolvedPath;
    } else if (resolvedPath.endsWith('.zip')) {
      // Template compressé: extraction dans le workspace temporaire
      const zip = new AdmZip(resolvedPath);
      zip.extractAllTo(workingDir, true);
      templateRoot = workingDir;
    } else {
      throw new Error('Template invalide: path doit être un dossier ou un zip');
    }

    const indexPath = await this.findFileRecursive(templateRoot, 'index.html');
    const svgPath = await this.findFileRecursive(templateRoot, 'template.svg');
    if (!indexPath && !svgPath) {
      throw new Error('index.html ou template.svg manquant dans le template');
    }
    const previewPath = await this.findFileRecursive(templateRoot, 'preview.png');

    return { workingDir, templateRoot, indexPath, svgPath, previewPath };
  }

  async findFileRecursive(rootDir, filename) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = await this.findFileRecursive(fullPath, filename);
        if (nested) return nested;
      }
    }
    return null;
  }

  async loadTemplateContent(indexPath) {
    const html = await fs.readFile(indexPath, 'utf8');
    const baseHref = `file://${path.dirname(indexPath)}/`;
    return `<base href="${baseHref}">` + html;
  }
}

module.exports = new HtmlTemplateService();
