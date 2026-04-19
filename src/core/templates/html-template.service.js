const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');

class HtmlTemplateService {
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
    const encodedSvg = Buffer.from(svgMarkup, 'utf8').toString('base64');

    return this.renderTemplateToPdf(
      `<html><body style="margin:0;background:#ffffff;display:grid;place-items:center;min-height:100vh;"><img alt="Ticket" src="data:image/svg+xml;base64,${encodedSvg}" style="display:block;width:${width || 760}px;height:${height || 420}px;" /></body></html>`,
      { width, height },
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
