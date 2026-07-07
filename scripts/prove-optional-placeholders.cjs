/**
 * Tranche P2b — Preuve isolée (MIROIR backend du ticket-generator-service).
 *
 * Vérifie, sans DB/Redis, que le moteur de template du generator backend gère :
 *   (a) un calque dynamique OPTIONNEL (guest_email) avec valeur vide -> masqué ;
 *   (b) le même placeholder avec une valeur -> rendu ;
 *   (c) la GARANTIE QR : un design sans calque QR reçoit une réinjection visible ;
 *   (d) aucun placeholder `{{...}}` brut dans la voie de substitution legacy.
 *
 * Le moteur pur (builderConfig -> SVG) est testé sans la couche DB. Une preuve
 * VISUELLE (PNG) est produite via le vrai moteur Chromium (renderSvgToExactRasterPdf)
 * si une instance Chromium est disponible ; sinon la limite est documentée et la
 * preuve fonctionnelle (SVG) reste autoritative.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildArchivedBuilderTicketSvg,
  resolveArchivedBuilderField,
  resolveBuilderDynamicTextValue,
  ARCHIVED_FIELD_MISSING,
} = require("../src/core/templates/builder-pdf-renderer");
const htmlTemplateService = require("../src/core/templates/html-template.service");
const ticketGenerationService = require("../src/services/ticket-generation.service");

const OUTPUT_DIR = path.resolve(__dirname, "..", ".artifacts");
const OUTPUT_BASENAME = "optional-placeholders-proof";

// Un calque custom-text porteur du placeholder dynamique guest_email, OPTIONNEL.
function emailLayer({ optional = true } = {}) {
  return {
    id: "guest_email_layer",
    binding: null,
    dynamicField: "guest_email",
    dynamicOptional: optional,
    kind: "custom-text",
    label: "Guest email",
    customText: "guest email",
    x: 42,
    y: 150,
    width: 400,
    height: 48,
    fontSize: 22,
    fontWeight: 700,
    align: "left",
    opacity: 1,
    radius: 8,
    visible: true,
    locked: false,
  };
}

function qrLayer() {
  return {
    id: "qr",
    binding: "qr",
    dynamicField: "qr_code",
    kind: "qr",
    label: "QR code",
    x: 602,
    y: 284,
    width: 120,
    height: 120,
    fontSize: 16,
    fontWeight: 700,
    align: "center",
    opacity: 1,
    radius: 18,
    visible: true,
    locked: false,
  };
}

function buildConfig({ includeQr = true, optionalEmail = true } = {}) {
  const layers = [emailLayer({ optional: optionalEmail })];
  if (includeQr) {
    layers.push(qrLayer());
  }
  return {
    design: {
      backgroundColor: "#08131D",
      accentColor: "#39C98B",
      textColor: "#FFFFFF",
      subTextColor: "rgba(255,255,255,0.68)",
      pattern: "none",
      canvasPresetId: "ticket-landscape",
      layers,
    },
    content: {
      title: "Optional Placeholder Proof",
      date: "2026-06-08",
      time: "19:30",
      location: "Proof Hall",
      guest: "Proof Guest",
      type: "VIP",
      footerLabel: "Hosted by Proof",
      ticketCode: "TKT-PROOF-0001",
    },
  };
}

// Marqueur unique du calque email rendu : le texte custom escapé apparaît dans un
// <text>. On détecte le rendu via la valeur résolue (l'email runtime).
function svgContainsEmail(svg, email) {
  return svg.includes(email);
}

function countVisibleQrPanels(svg) {
  // Chaque calque QR rendu émet un <image href> QR ou les modules QR de secours.
  // On compte les groupes de modules QR (bloc de secours) + images QR data-url.
  const moduleGroups = (svg.match(/qr-?modules|stroke-width="4" fill="none"/g) || []).length;
  return moduleGroups;
}

const result = {
  ok: false,
  scope: "backend/ticket-generator-service (template engine, no DB/Redis)",
  asserts: {},
  visualProof: null,
  limits: [],
};

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --- (a) Optionnel + valeur vide -> calque masqué ---------------------------
  const svgEmptyOptional = buildArchivedBuilderTicketSvg({
    builderConfig: buildConfig({ includeQr: true, optionalEmail: true }),
    recipientContent: { guestEmail: "" },
  });
  const optionalEmptyHidden = !svgContainsEmail(svgEmptyOptional, "@");
  assert.ok(
    optionalEmptyHidden,
    "(a) Le placeholder guest_email OPTIONNEL vide doit être masqué (aucun email rendu).",
  );

  // --- (b) Optionnel + valeur présente -> calque rendu ------------------------
  const svgWithEmail = buildArchivedBuilderTicketSvg({
    builderConfig: buildConfig({ includeQr: true, optionalEmail: true }),
    recipientContent: { guestEmail: "vip@example.com" },
  });
  const optionalValueShown = svgContainsEmail(svgWithEmail, "vip@example.com");
  assert.ok(
    optionalValueShown,
    "(b) Le placeholder guest_email avec valeur doit être rendu dans le SVG.",
  );

  // Non-régression : optionnel masqué vs rendu produisent des SVG différents.
  assert.notEqual(
    svgEmptyOptional,
    svgWithEmail,
    "Le SVG optionnel-vide et le SVG avec-valeur doivent différer (preuve du chemin de masquage).",
  );

  // --- (c) Garantie QR : design SANS calque QR -> réinjection visible ---------
  const svgNoQr = buildArchivedBuilderTicketSvg({
    builderConfig: buildConfig({ includeQr: false, optionalEmail: true }),
    recipientContent: { guestEmail: "" },
  });
  const qrPanelsNoQr = countVisibleQrPanels(svgNoQr);
  assert.ok(
    qrPanelsNoQr >= 1,
    "(c) Un design sans calque QR doit recevoir une réinjection QR visible (garantie QR).",
  );

  // --- (d) Aucun placeholder `{{...}}` brut (voie de substitution legacy) -----
  const rawSubstituted = ticketGenerationService.replaceTemplateVariables(
    '<svg><text>{{EVENT_TITLE}} {{UNKNOWN}} {{ RECIPIENT.GUEST_EMAIL }}</text>'
      + '<image href="{{QR_CODE}}" /></svg>',
    { EVENT_TITLE: "Resolved Title" },
    { RECIPIENT: { GUEST_EMAIL: "real@example.com", QR_CODE: "data:image/png;base64,AAAA" } },
  );
  const hasRawPlaceholder = /\{\{[^{}]*\}\}/.test(rawSubstituted);
  assert.ok(
    !hasRawPlaceholder,
    `(d) Aucun placeholder {{...}} brut ne doit subsister. Reste: ${rawSubstituted}`,
  );
  assert.ok(rawSubstituted.includes("Resolved Title"), "(d) Variable connue doit être substituée.");
  assert.ok(rawSubstituted.includes("real@example.com"), "(d) Variable scoped doit être substituée.");
  assert.ok(!rawSubstituted.includes("UNKNOWN"), "(d) Placeholder inconnu doit être supprimé.");

  // --- resolveArchivedBuilderField : signal "champ absent" explicite ----------
  const missing = resolveArchivedBuilderField({
    archivedContent: {},
    recipientContent: null,
    recipientKey: "guest",
    archivedKey: "guest",
    fallback: "Guest",
    signalMissing: true,
  });
  const fallbackKept = resolveArchivedBuilderField({
    archivedContent: {},
    recipientContent: null,
    recipientKey: "guest",
    archivedKey: "guest",
    fallback: "Guest",
  });
  assert.equal(missing, ARCHIVED_FIELD_MISSING, "resolveArchivedBuilderField doit signaler l'absence.");
  assert.equal(fallbackKept, "Guest", "Non-régression: fallback conservé par défaut.");

  // resolveBuilderDynamicTextValue : custom_field via clé libre
  const customValue = resolveBuilderDynamicTextValue(
    "custom_field",
    { customFieldKey: "seat" },
    { customFields: { seat: "A12" } },
  );
  assert.equal(customValue, "A12", "custom_field doit résoudre via la clé libre.");

  result.asserts = {
    optionalEmptyHidden,
    optionalValueShown,
    qrPanelsWhenNoQrLayer: qrPanelsNoQr,
    rawPlaceholderCleaned: !hasRawPlaceholder,
    archivedFieldMissingSignal: missing === ARCHIVED_FIELD_MISSING,
    customFieldResolved: customValue === "A12",
  };

  // --- Preuve VISUELLE : rendu PNG via le vrai moteur Chromium ----------------
  try {
    const artifact = await htmlTemplateService.renderSvgToExactRasterPdf(svgWithEmail);
    const pngPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.png`);
    const pdfPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.pdf`);
    fs.writeFileSync(pngPath, artifact.pngBuffer);
    fs.writeFileSync(pdfPath, artifact.pdfBuffer);
    result.visualProof = {
      pngPath,
      pdfPath,
      pngSha256: artifact.pngSha256,
      width: artifact.width,
      height: artifact.height,
    };
  } catch (renderError) {
    // Chromium peut être absent en environnement isolé : la preuve fonctionnelle
    // (SVG) reste autoritative ; on sauvegarde le SVG comme preuve de repli.
    const svgPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.svg`);
    fs.writeFileSync(svgPath, svgWithEmail, "utf8");
    result.visualProof = { svgPath };
    result.limits.push(
      `Rendu PNG/PDF Chromium indisponible (${renderError.message}); SVG sauvegardé comme preuve visuelle de repli.`,
    );
  }

  // Sauvegarde aussi les SVG des 3 cas pour inspection visuelle directe.
  fs.writeFileSync(path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}-empty.svg`), svgEmptyOptional, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}-value.svg`), svgWithEmail, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}-noqr.svg`), svgNoQr, "utf8");

  result.ok = true;
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`),
    JSON.stringify(result, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`),
      JSON.stringify(result, null, 2),
      "utf8",
    );
  } catch (_) {
    /* ignore */
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
});
