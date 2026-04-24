import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import AdmZip from "adm-zip";
import QRCode from "qrcode";

import ticketGenerationService from "../src/services/ticket-generation.service.js";
import databaseModule from "../src/config/database.js";
import {
  compareBuilderRenderToPdf,
  readArchivedBuilderConfig,
} from "../../../frontend/scripts/_lib/builder-pdf-visual-parity.mjs";

const { database } = databaseModule;

const MAX_DIFF_PERCENT = Number(process.env.BUILDER_PDF_MAX_DIFF_PERCENT ?? "0.1");
const PIXEL_THRESHOLD = Number(process.env.BUILDER_PDF_PIXEL_THRESHOLD ?? "0.1");
const FRONTEND_WORKSPACE = path.resolve(process.cwd(), "../../frontend");
const OUTPUT_DIR = path.resolve(process.cwd(), ".codex-runtime");
const OUTPUT_BASENAME = "canonical-builder-pdf-parity";

const templateWorkspace = mkdtempSync(
  path.join(tmpdir(), "ticket-generator-canonical-builder-proof-"),
);
const templateDir = path.join(templateWorkspace, "template");
const templateSvgPath = path.join(templateDir, "template.svg");
const manifestPath = path.join(templateDir, "manifest.json");
const templateArchivePath = path.join(templateWorkspace, "template-package.zip");

const builderManifest = {
  builder: {
    design: {
      backgroundColor: "#08131D",
      accentColor: "#39C98B",
      textColor: "#FFFFFF",
      subTextColor: "rgba(255,255,255,0.68)",
      pattern: "none",
      canvasPresetId: "ticket-landscape",
    },
    content: {
      title: "Archived Placeholder",
      date: "2026-01-01",
      time: "18:00",
      location: "Archived Location",
      guest: "Archived Guest",
      type: "Archived Type",
      footerLabel: "Archived Footer",
      ticketCode: "ARCHIVED-CODE-001",
    },
  },
};

const enrichedTicket = {
  ticket_id: "42",
  ticket_code: "TKT-BUILDER-001",
  qr_code_data: "TKT-BUILDER-001",
  status: "active",
  created_at: "2026-06-14T18:00:00.000Z",
  guest: {
    id: "7",
    first_name: "Mireille",
    last_name: "Tchoumi",
    email: "mireille@example.com",
  },
  ticket_type: {
    name: "VIP",
    price: 150,
  },
  event: {
    id: "11",
    title: "Builder Summit",
    date: "2026-06-14T18:00:00.000Z",
    location: "Douala Conference Center",
    organizer_name: "Governor Organizer",
  },
  template: {
    source_files_path: templateArchivePath,
  },
};

const visualArtifacts = {
  svgPath: path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.builder-reference.svg`),
  builderPngPath: path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.builder-reference.png`),
  pdfPngPath: path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.pdf-rasterized.png`),
  diffPngPath: path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.pdf-parity-diff.png`),
};

let result = null;

try {
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  await fs.writeFile(
    templateSvgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="420"><text x="20" y="40">LEGACY TEMPLATE SHOULD NOT WIN</text></svg>',
    "utf8",
  );
  await fs.writeFile(manifestPath, JSON.stringify(builderManifest, null, 2), "utf8");

  const archive = new AdmZip();
  archive.addLocalFile(templateSvgPath);
  archive.addLocalFile(manifestPath);
  archive.writeZip(templateArchivePath);

  const artifact = await ticketGenerationService.generatePDFArtifact(enrichedTicket);
  assert.equal(artifact.renderMode, "archived-builder-manifest");
  assert.equal(artifact.renderEngine, "chromium-svg-pdf");

  const builderConfig = readArchivedBuilderConfig(templateArchivePath);
  const qrDataUrl = await QRCode.toDataURL(enrichedTicket.qr_code_data);
  const parity = await compareBuilderRenderToPdf({
    workspace: FRONTEND_WORKSPACE,
    builderConfig,
    liveContent: {
      title: enrichedTicket.event.title,
      date: "2026-06-14",
      time: "18:00",
      location: enrichedTicket.event.location,
      guest: "Mireille Tchoumi",
      type: enrichedTicket.ticket_type.name,
      footerLabel: "Hosted by Governor Organizer",
      ticketCode: enrichedTicket.ticket_code,
      qrDataUrl,
    },
    pdfBuffer: artifact.pdfBuffer,
    output: visualArtifacts,
    pixelThreshold: PIXEL_THRESHOLD,
  });

  assert.ok(
    parity.diffPercent < MAX_DIFF_PERCENT,
    `Visual parity drift ${parity.diffPercent}% exceeded ${MAX_DIFF_PERCENT}%.`,
  );

  result = {
    ok: true,
    renderMode: artifact.renderMode,
    renderEngine: artifact.renderEngine,
    diffPercent: parity.diffPercent,
    diffPixels: parity.diffPixels,
    totalPixels: parity.totalPixels,
    maxDiffPercent: MAX_DIFF_PERCENT,
    pixelThreshold: PIXEL_THRESHOLD,
    templateArchivePath,
    artifacts: visualArtifacts,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`),
    JSON.stringify(result, null, 2),
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    templateArchivePath,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`),
    JSON.stringify(result, null, 2),
    "utf8",
  );

  throw error;
} finally {
  await fs.rm(templateWorkspace, { recursive: true, force: true });
  await database.end().catch(() => {});
}
