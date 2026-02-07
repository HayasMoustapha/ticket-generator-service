const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');

class HtmlTemplateService {
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
      const pdfBuffer = await page.pdf({
        printBackground: true,
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        format: width && height ? undefined : 'A4'
      });

      return pdfBuffer;
    } finally {
      await browser.close();
    }
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
    if (!indexPath) {
      throw new Error('index.html manquant dans le template');
    }

    const previewPath = await this.findFileRecursive(templateRoot, 'preview.png');

    return { workingDir, templateRoot, indexPath, previewPath };
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
