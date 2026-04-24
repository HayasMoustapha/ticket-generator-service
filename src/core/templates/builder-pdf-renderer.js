const QR_MODULES = [
  [40, 2], [46, 2], [52, 2], [58, 2], [40, 8], [52, 8], [40, 14], [46, 14], [58, 14],
  [40, 20], [46, 20], [52, 20], [40, 26], [52, 26], [58, 26], [2, 40], [8, 40], [20, 40],
  [26, 40], [40, 40], [52, 40], [64, 40], [76, 40], [88, 40], [94, 40], [2, 46], [14, 46],
  [20, 46], [40, 46], [46, 46], [58, 46], [70, 46], [82, 46], [8, 52], [20, 52], [26, 52],
  [40, 52], [52, 52], [58, 52], [70, 52], [88, 52], [94, 52], [2, 58], [14, 58], [26, 58],
  [40, 58], [46, 58], [64, 58], [76, 58], [82, 58], [40, 64], [52, 64], [58, 64], [70, 64],
  [88, 64], [94, 64], [46, 70], [58, 70], [70, 70], [76, 70], [88, 70], [40, 76], [52, 76],
  [64, 76], [76, 76], [94, 76], [46, 82], [52, 82], [70, 82], [82, 82], [88, 82], [40, 88],
  [58, 88], [64, 88], [76, 88], [88, 88], [94, 88], [40, 94], [46, 94], [52, 94], [64, 94],
  [76, 94], [82, 94],
];

const BUILDER_CANVAS_PRESETS = [
  {
    id: "ticket-landscape",
    label: "Event Ticket",
    width: 760,
    height: 420,
    category: "ticket",
    previewLabel: "760 x 420",
  },
  {
    id: "flyer-portrait",
    label: "Flyer Poster",
    width: 1080,
    height: 1350,
    category: "flyer",
    previewLabel: "1080 x 1350",
  },
  {
    id: "pass-portrait",
    label: "VIP Pass",
    width: 540,
    height: 860,
    category: "pass",
    previewLabel: "540 x 860",
  },
];

const DEFAULT_LAYER_ORDER = [
  "badge",
  "title",
  "accent",
  "schedule",
  "venue",
  "divider",
  "guest",
  "type",
  "code",
  "qr",
  "logo",
  "footer",
];

function trimOrNull(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function resolveQrPalette(textColor) {
  const normalizedTextColor = trimOrNull(textColor);
  if (normalizedTextColor && normalizedTextColor.toLowerCase() === "#1e1e1e") {
    return {
      qrColor: "#1E1E1E",
      qrPanelColor: "rgba(0,0,0,0.05)",
    };
  }

  return {
    qrColor: "#08131D",
    qrPanelColor: "rgba(255,255,255,0.95)",
  };
}

function escapeSvgText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function estimateLineWidth(value, fontSize) {
  return String(value || "").length * fontSize * 0.56;
}

function wrapText(value, fontSize, maxWidth, maxLines = 3) {
  const tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [""];
  }

  const lines = [];
  let current = "";

  tokens.forEach((token) => {
    const candidate = current ? `${current} ${token}` : token;
    if (estimateLineWidth(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
      return;
    }

    lines.push(current);
    current = token;
  });

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  const lastLine = trimmed[maxLines - 1] || "";
  trimmed[maxLines - 1] =
    lastLine.length > 3 ? `${lastLine.slice(0, Math.max(0, lastLine.length - 3))}...` : "...";
  return trimmed;
}

function getTextAnchor(align) {
  if (align === "center") {
    return "middle";
  }

  if (align === "right") {
    return "end";
  }

  return "start";
}

function getAnchorX(layer) {
  if (layer.align === "center") {
    return layer.x + layer.width / 2;
  }

  if (layer.align === "right") {
    return layer.x + layer.width;
  }

  return layer.x;
}

function getBuilderLayerBindingId(layer) {
  if (layer && layer.binding) {
    return layer.binding;
  }

  const normalizedId = String(layer && layer.id ? layer.id : "").split("__")[0];
  if (DEFAULT_LAYER_ORDER.includes(normalizedId)) {
    return normalizedId;
  }

  return "footer";
}

function getBuilderCanvasPreset(canvasPresetId = "ticket-landscape") {
  return BUILDER_CANVAS_PRESETS.find((preset) => preset.id === canvasPresetId) || BUILDER_CANVAS_PRESETS[0];
}

function createDefaultLayer(
  id,
  kind,
  label,
  x,
  y,
  width,
  height,
  fontSize,
  fontWeight,
  align = "left",
  radius = 10,
) {
  return {
    id,
    binding: id,
    kind,
    label,
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight,
    align,
    opacity: 1,
    radius,
    visible: true,
    locked: false,
    groupId: null,
  };
}

function createDefaultBuilderLayers(canvasPresetId = "ticket-landscape") {
  const canvas = getBuilderCanvasPreset(canvasPresetId);

  if (canvas.id === "flyer-portrait") {
    return [
      createDefaultLayer("badge", "badge", "Eyebrow", 64, 72, 152, 44, 18, 800),
      createDefaultLayer("title", "title", "Title", 64, 170, 760, 188, 74, 800),
      createDefaultLayer("accent", "accent", "Accent line", 64, 394, 140, 8, 8, 700, "left", 999),
      createDefaultLayer("schedule", "info", "Schedule", 64, 454, 420, 136, 40, 700),
      createDefaultLayer("venue", "info", "Venue", 64, 622, 460, 142, 40, 700),
      createDefaultLayer("divider", "divider", "Divider", 56, 792, 968, 2, 2, 700, "left", 999),
      createDefaultLayer("guest", "guest", "Guest block", 64, 836, 540, 168, 58, 800),
      createDefaultLayer("type", "type", "Type badge", 64, 1046, 320, 58, 26, 800),
      createDefaultLayer("code", "code", "Ticket code", 64, 1146, 420, 32, 20, 700),
      createDefaultLayer("qr", "qr", "QR code", 802, 918, 216, 216, 20, 700, "center", 24),
      createDefaultLayer("logo", "logo", "Logo", 896, 72, 120, 120, 20, 700, "center", 24),
      createDefaultLayer("footer", "footer", "Footer", 64, 1280, 952, 36, 20, 700),
    ];
  }

  if (canvas.id === "pass-portrait") {
    return [
      createDefaultLayer("badge", "badge", "Eyebrow", 40, 40, 126, 36, 15, 800),
      createDefaultLayer("title", "title", "Title", 40, 150, 350, 138, 52, 800),
      createDefaultLayer("accent", "accent", "Accent line", 40, 286, 92, 6, 6, 700, "left", 999),
      createDefaultLayer("schedule", "info", "Schedule", 40, 320, 300, 96, 28, 700),
      createDefaultLayer("venue", "info", "Venue", 40, 430, 300, 110, 28, 700),
      createDefaultLayer("divider", "divider", "Divider", 26, 560, 488, 2, 2, 700, "left", 999),
      createDefaultLayer("guest", "guest", "Guest block", 40, 592, 300, 126, 40, 800),
      createDefaultLayer("type", "type", "Type badge", 40, 716, 230, 44, 18, 800),
      createDefaultLayer("code", "code", "Ticket code", 40, 782, 260, 24, 16, 700),
      createDefaultLayer("qr", "qr", "QR code", 356, 612, 144, 144, 20, 700, "center", 18),
      createDefaultLayer("logo", "logo", "Logo", 404, 34, 96, 96, 20, 700, "center", 20),
      createDefaultLayer("footer", "footer", "Footer", 40, 828, 460, 24, 14, 700),
    ];
  }

  return [
    createDefaultLayer("badge", "badge", "Eyebrow", 42, 34, 110, 36, 16, 800),
    createDefaultLayer("title", "title", "Title", 42, 98, 446, 78, 42, 800),
    createDefaultLayer("accent", "accent", "Accent line", 42, 158, 72, 6, 6, 700, "left", 999),
    createDefaultLayer("schedule", "info", "Schedule", 42, 186, 250, 66, 22, 700),
    createDefaultLayer("venue", "info", "Venue", 328, 186, 242, 66, 22, 700),
    createDefaultLayer("divider", "divider", "Divider", 24, 252, 712, 2, 2, 700, "left", 999),
    createDefaultLayer("guest", "guest", "Guest block", 42, 284, 282, 78, 30, 800),
    createDefaultLayer("type", "type", "Type badge", 42, 344, 220, 36, 15, 800),
    createDefaultLayer("code", "code", "Ticket code", 42, 392, 240, 22, 14, 700),
    createDefaultLayer("qr", "qr", "QR code", 602, 284, 120, 120, 16, 700, "center", 18),
    createDefaultLayer("logo", "logo", "Logo", 642, 32, 72, 72, 16, 700, "center", 14),
    createDefaultLayer("footer", "footer", "Footer", 492, 392, 220, 20, 14, 700, "right"),
  ];
}

function normalizeBuilderLayers(layers, canvasPresetId = "ticket-landscape") {
  const canvas = getBuilderCanvasPreset(canvasPresetId);
  const defaults = createDefaultBuilderLayers(canvasPresetId);
  const incomingLayers = Array.isArray(layers) ? layers : [];
  const defaultByBinding = new Map(defaults.map((layer) => [getBuilderLayerBindingId(layer), layer]));

  const hydratedLayers = incomingLayers.map((candidate) => {
    const bindingId = getBuilderLayerBindingId(candidate);
    const baseLayer = defaultByBinding.get(bindingId) || defaults[0];

    const width = clamp(Number.isFinite(candidate.width) ? candidate.width : baseLayer.width, 24, canvas.width);
    const height = clamp(Number.isFinite(candidate.height) ? candidate.height : baseLayer.height, 12, canvas.height);

    return {
      ...baseLayer,
      ...candidate,
      binding: bindingId,
      width,
      height,
      x: clamp(Number.isFinite(candidate.x) ? candidate.x : baseLayer.x, 0, Math.max(0, canvas.width - width)),
      y: clamp(Number.isFinite(candidate.y) ? candidate.y : baseLayer.y, 0, Math.max(0, canvas.height - height)),
      fontSize: clamp(
        Number.isFinite(candidate.fontSize) ? candidate.fontSize : baseLayer.fontSize,
        8,
        Math.max(12, Math.floor(canvas.height / 4)),
      ),
      fontWeight: clamp(
        Number.isFinite(candidate.fontWeight) ? candidate.fontWeight : baseLayer.fontWeight,
        400,
        900,
      ),
      opacity: clamp(Number.isFinite(candidate.opacity) ? candidate.opacity : baseLayer.opacity, 0.1, 1),
      radius: clamp(Number.isFinite(candidate.radius) ? candidate.radius : baseLayer.radius, 0, 999),
      align: candidate.align === "center" || candidate.align === "right" ? candidate.align : baseLayer.align,
      visible: typeof candidate.visible === "boolean" ? candidate.visible : baseLayer.visible,
      locked: typeof candidate.locked === "boolean" ? candidate.locked : baseLayer.locked,
      groupId: typeof candidate.groupId === "string" && candidate.groupId.trim() ? candidate.groupId : null,
      customText: typeof candidate.customText === "string" ? candidate.customText : baseLayer.customText || null,
      fontFamily:
        typeof candidate.fontFamily === "string" && candidate.fontFamily.trim()
          ? candidate.fontFamily
          : baseLayer.fontFamily || null,
      fillColor:
        typeof candidate.fillColor === "string" && candidate.fillColor.trim()
          ? candidate.fillColor
          : baseLayer.fillColor || null,
      strokeColor:
        typeof candidate.strokeColor === "string" && candidate.strokeColor.trim()
          ? candidate.strokeColor
          : baseLayer.strokeColor || null,
      strokeWidth: clamp(
        typeof candidate.strokeWidth === "number" && Number.isFinite(candidate.strokeWidth)
          ? candidate.strokeWidth
          : baseLayer.strokeWidth || 0,
        0,
        24,
      ),
      backgroundImageUrl:
        typeof candidate.backgroundImageUrl === "string" && candidate.backgroundImageUrl.trim()
          ? candidate.backgroundImageUrl
          : baseLayer.backgroundImageUrl || null,
      rotation:
        typeof candidate.rotation === "number" && Number.isFinite(candidate.rotation)
          ? candidate.rotation
          : baseLayer.rotation || 0,
    };
  });

  const missingDefaultLayers = defaults.filter((defaultLayer) => {
    const bindingId = getBuilderLayerBindingId(defaultLayer);
    return !hydratedLayers.some((layer) => getBuilderLayerBindingId(layer) === bindingId);
  });

  return [...hydratedLayers, ...missingDefaultLayers];
}

function renderTextBlockLines(layer, lines, fill, lineHeight) {
  const safeLines = lines.map((line) => escapeSvgText(line));
  const anchor = getTextAnchor(layer.align);
  const anchorX = getAnchorX(layer);
  const firstLineY = layer.y + layer.fontSize;
  const tspanMarkup = safeLines
    .map((line, index) => `<tspan x="${anchorX}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`)
    .join("");

  return `<text x="${anchorX}" y="${firstLineY}" text-anchor="${anchor}" fill="${fill}" font-family="${escapeSvgText(
    layer.fontFamily || "Nunito, Arial, sans-serif",
  )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" opacity="${layer.opacity}">${tspanMarkup}</text>`;
}

function renderLabelAndValue(layer, label, value, textColor, subTextColor) {
  const bindingId = getBuilderLayerBindingId(layer);
  const anchor = getTextAnchor(layer.align);
  const anchorX = getAnchorX(layer);
  const labelSize = Math.max(11, Math.round(layer.fontSize * 0.55));
  const labelY = layer.y + labelSize;
  const valueTop = layer.y + labelSize + 14;
  const wrappedValue = wrapText(value, layer.fontSize, layer.width, bindingId === "guest" ? 3 : 2);
  const safeValue = wrappedValue.map((line) => escapeSvgText(line));
  const tspanMarkup = safeValue
    .map((line, index) => {
      const lineHeight = Math.round(layer.fontSize * 1.15);
      return `<tspan x="${anchorX}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`;
    })
    .join("");

  return `
    <text x="${anchorX}" y="${labelY}" text-anchor="${anchor}" fill="${subTextColor}" font-family="Nunito, Arial, sans-serif" font-size="${labelSize}" font-weight="700" opacity="${layer.opacity}">${escapeSvgText(
      label,
    )}</text>
    <text x="${anchorX}" y="${valueTop + layer.fontSize}" text-anchor="${anchor}" fill="${layer.fillColor || textColor}" font-family="${escapeSvgText(
      layer.fontFamily || "Nunito, Arial, sans-serif",
    )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" opacity="${layer.opacity}">${tspanMarkup}</text>
  `;
}

function applyLayerTransform(layer, markup) {
  const rotation = typeof layer.rotation === "number" ? layer.rotation : 0;
  if (!String(markup || "").trim() || rotation === 0) {
    return markup;
  }

  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  return `<g transform="rotate(${rotation} ${centerX} ${centerY})">${markup}</g>`;
}

function buildPatternMarkup(pattern, width, height, accentColor) {
  if (pattern === "confetti") {
    const circles = [
      [width * 0.16, height * 0.17, 5],
      [width * 0.39, height * 0.28, 3],
      [width * 0.72, height * 0.22, 4],
      [width * 0.87, height * 0.43, 3],
      [width * 0.28, height * 0.62, 4],
      [width * 0.74, height * 0.77, 5],
    ];

    return `<g opacity="0.14">${circles
      .map(([cx, cy, r]) => `<circle cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="${r}" fill="${accentColor}" />`)
      .join("")}</g>`;
  }

  if (pattern === "dots") {
    return `
      <pattern id="ticket-dots" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.4" fill="${accentColor}" opacity="0.18" />
      </pattern>
      <rect width="${width}" height="${height}" fill="url(#ticket-dots)" />
    `;
  }

  if (pattern === "waves") {
    return `
      <pattern id="ticket-waves" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="44" stroke="${accentColor}" stroke-width="2" opacity="0.12" />
      </pattern>
      <rect width="${width}" height="${height}" fill="url(#ticket-waves)" />
    `;
  }

  return "";
}

function buildTicketExportSvg(design) {
  const canvas = getBuilderCanvasPreset(design.canvasPresetId || "ticket-landscape");
  const safeLogoDataUrl = design.logoDataUrl ? design.logoDataUrl.replaceAll("&", "&amp;") : null;
  const safeQrDataUrl = design.qrDataUrl ? design.qrDataUrl.replaceAll("&", "&amp;") : null;
  const safeBackgroundImageUrl = design.backgroundImageUrl ? design.backgroundImageUrl.replaceAll("&", "&amp;") : null;
  const patternMarkup = buildPatternMarkup(design.pattern, canvas.width, canvas.height, design.accentColor);
  const gradientId = design.backgroundGradient ? "ticket-background-gradient" : null;
  const normalizedLayers = normalizeBuilderLayers(design.layers, design.canvasPresetId || "ticket-landscape");
  const qrModulesMarkup = QR_MODULES.map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4" rx="0.5" fill="${design.qrColor}" />`).join("");

  const renderedLayers = normalizedLayers.map((layer) => {
    if (!layer || !layer.visible) {
      return "";
    }

    const bindingId = getBuilderLayerBindingId(layer);

    if (layer.kind === "shape") {
      const fillColor = layer.fillColor || `${design.accentColor}26`;
      const strokeColor = layer.strokeColor || design.accentColor;
      const strokeWidth = clamp(layer.strokeWidth || 0, 0, 24);
      const layerBackgroundImageUrl = layer.backgroundImageUrl ? layer.backgroundImageUrl.replaceAll("&", "&amp;") : null;
      const clipId = `shape-clip-${String(layer.id).replace(/[^a-z0-9_-]+/gi, "-")}`;
      return applyLayerTransform(layer, `
        <clipPath id="${clipId}">
          <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" />
        </clipPath>
        <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="${layer.opacity}" />
        ${
          layerBackgroundImageUrl
            ? `<image href="${layerBackgroundImageUrl}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" opacity="${layer.opacity}" />
               <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="${layer.opacity}" />`
            : ""
        }
      `);
    }

    if (layer.kind === "custom-text") {
      const lines = wrapText(layer.customText || layer.label || "Text block", layer.fontSize, layer.width, 4);
      return applyLayerTransform(
        layer,
        renderTextBlockLines(layer, lines, layer.fillColor || design.textColor, Math.round(layer.fontSize * 1.12)),
      );
    }

    if (layer.kind === "badge") {
      const badgeFill = layer.fillColor || design.accentColor;
      const badgeTextColor = layer.strokeColor || design.backgroundColor;
      const label = canvas.category === "flyer" ? "INVITE" : "TICKET";
      return applyLayerTransform(layer, `
        <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="${badgeFill}" opacity="${layer.opacity}" />
        <text x="${layer.x + layer.width / 2}" y="${layer.y + layer.height / 2 + layer.fontSize * 0.34}" text-anchor="middle" fill="${badgeTextColor}" font-family="${escapeSvgText(
          layer.fontFamily || "Nunito, Arial, sans-serif",
        )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}">${escapeSvgText(label)}</text>
      `);
    }

    if (layer.kind === "title") {
      const lines = wrapText(design.title, layer.fontSize, layer.width, canvas.id === "flyer-portrait" ? 4 : 3);
      return applyLayerTransform(
        layer,
        renderTextBlockLines(layer, lines, layer.fillColor || design.textColor, Math.round(layer.fontSize * 1.08)),
      );
    }

    if (layer.kind === "accent") {
      return applyLayerTransform(layer, `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${Math.max(4, layer.height)}" rx="${layer.radius}" fill="${layer.fillColor || design.accentColor}" opacity="${layer.opacity}" />`);
    }

    if (layer.kind === "info" && bindingId === "schedule") {
      return applyLayerTransform(layer, renderLabelAndValue(layer, "DATE & TIME", `${design.date} • ${design.time}`, design.textColor, design.subTextColor));
    }

    if (layer.kind === "info" && bindingId === "venue") {
      return applyLayerTransform(layer, renderLabelAndValue(layer, "VENUE", design.location, design.textColor, design.subTextColor));
    }

    if (layer.kind === "divider") {
      const y = layer.y + layer.height / 2;
      return applyLayerTransform(layer, `<line x1="${layer.x}" y1="${y}" x2="${layer.x + layer.width}" y2="${y}" stroke="${layer.strokeColor || design.textColor}" stroke-width="${Math.max(1.5, layer.height)}" stroke-dasharray="10 8" opacity="${Math.min(layer.opacity, 0.44)}" />`);
    }

    if (layer.kind === "guest") {
      return applyLayerTransform(layer, renderLabelAndValue(layer, "GUEST", design.guest, design.textColor, design.subTextColor));
    }

    if (layer.kind === "type") {
      const typeFill = layer.fillColor || design.accentColor;
      const typeTextColor = layer.strokeColor || design.backgroundColor;
      return applyLayerTransform(layer, `
        <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="${typeFill}" opacity="${layer.opacity}" />
        <text x="${layer.x + layer.width / 2}" y="${layer.y + layer.height / 2 + layer.fontSize * 0.34}" text-anchor="middle" fill="${typeTextColor}" font-family="${escapeSvgText(
          layer.fontFamily || "Nunito, Arial, sans-serif",
        )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}">${escapeSvgText(String(design.type || "").toUpperCase())}</text>
      `);
    }

    if (layer.kind === "code") {
      const anchor = getTextAnchor(layer.align);
      const anchorX = getAnchorX(layer);
      return applyLayerTransform(layer, `<text x="${anchorX}" y="${layer.y + layer.fontSize}" text-anchor="${anchor}" fill="${layer.fillColor || design.subTextColor}" font-family="${escapeSvgText(
        layer.fontFamily || "'Roboto Mono', monospace",
      )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" opacity="${layer.opacity}">${escapeSvgText(design.ticketCode || "TKT-SAMPLE-0001")}</text>`);
    }

    if (layer.kind === "qr") {
      const qrSize = Math.min(layer.width, layer.height);
      const panelX = layer.x + (layer.width - qrSize) / 2;
      const panelY = layer.y + (layer.height - qrSize) / 2;
      const panelRadius = clamp(layer.radius, 8, 24);
      const qrMarkup = safeQrDataUrl
        ? `<image href="${safeQrDataUrl}" x="${panelX + qrSize * 0.12}" y="${panelY + qrSize * 0.12}" width="${qrSize * 0.76}" height="${qrSize * 0.76}" preserveAspectRatio="xMidYMid meet" />`
        : `<g transform="translate(${panelX + qrSize * 0.09} ${panelY + qrSize * 0.09}) scale(${qrSize / 118})">
             <rect x="2" y="2" width="30" height="30" rx="2" stroke="${design.qrColor}" stroke-width="4" fill="none" />
             <rect x="10" y="10" width="14" height="14" rx="1" fill="${design.qrColor}" />
             <rect x="68" y="2" width="30" height="30" rx="2" stroke="${design.qrColor}" stroke-width="4" fill="none" />
             <rect x="76" y="10" width="14" height="14" rx="1" fill="${design.qrColor}" />
             <rect x="2" y="68" width="30" height="30" rx="2" stroke="${design.qrColor}" stroke-width="4" fill="none" />
             <rect x="10" y="76" width="14" height="14" rx="1" fill="${design.qrColor}" />
             ${qrModulesMarkup}
           </g>`;

      return applyLayerTransform(layer, `
        <rect x="${panelX}" y="${panelY}" width="${qrSize}" height="${qrSize}" rx="${panelRadius}" fill="${design.qrPanelColor}" opacity="${layer.opacity}" />
        ${qrMarkup}
      `);
    }

    if (layer.kind === "logo") {
      const resolvedLogoUrl = layer.backgroundImageUrl ? layer.backgroundImageUrl.replaceAll("&", "&amp;") : safeLogoDataUrl;
      if (!resolvedLogoUrl) {
        return "";
      }

      return applyLayerTransform(layer, `
        <rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="rgba(255,255,255,0.94)" opacity="${layer.opacity}" />
        <image href="${resolvedLogoUrl}" x="${layer.x + layer.width * 0.16}" y="${layer.y + layer.height * 0.16}" width="${layer.width * 0.68}" height="${layer.height * 0.68}" preserveAspectRatio="xMidYMid slice" />
      `);
    }

    if (layer.kind === "footer") {
      const anchor = getTextAnchor(layer.align);
      const anchorX = getAnchorX(layer);
      const lines = wrapText(design.footerLabel, layer.fontSize, layer.width, 2);
      const safeLines = lines.map((line) => escapeSvgText(line));
      const lineHeight = Math.round(layer.fontSize * 1.1);
      const tspanMarkup = safeLines
        .map((line, index) => `<tspan x="${anchorX}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`)
        .join("");
      return applyLayerTransform(layer, `<text x="${anchorX}" y="${layer.y + layer.fontSize}" text-anchor="${anchor}" fill="${layer.fillColor || design.subTextColor}" font-family="${escapeSvgText(
        layer.fontFamily || "Nunito, Arial, sans-serif",
      )}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" opacity="${layer.opacity}">${tspanMarkup}</text>`);
    }

    return "";
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
      <defs>
        <clipPath id="ticket-clip">
          <rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" rx="${canvas.category === "flyer" ? 36 : 28}" />
        </clipPath>
        ${
          design.backgroundGradient
            ? `<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${canvas.width}" y2="${canvas.height}">
                 <stop offset="0%" stop-color="${design.backgroundGradient.from}" />
                 <stop offset="100%" stop-color="${design.backgroundGradient.to}" />
               </linearGradient>`
            : ""
        }
      </defs>
      <g clip-path="url(#ticket-clip)">
        <rect width="${canvas.width}" height="${canvas.height}" fill="${design.backgroundColor}" />
        ${
          design.backgroundGradient
            ? `<rect width="${canvas.width}" height="${canvas.height}" fill="url(#${gradientId})" />`
            : ""
        }
        ${
          safeBackgroundImageUrl
            ? `<image href="${safeBackgroundImageUrl}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" preserveAspectRatio="xMidYMid slice" />`
            : ""
        }
        ${patternMarkup}
        ${renderedLayers}
      </g>
    </svg>
  `.trim();
}

function buildArchivedBuilderTicketSvg({ builderConfig, liveContent }) {
  const design = builderConfig && builderConfig.design ? builderConfig.design : {};
  const archivedContent = builderConfig && builderConfig.content ? builderConfig.content : {};
  const textColor = trimOrNull(design.textColor) || "#FFFFFF";
  const { qrColor, qrPanelColor } = resolveQrPalette(textColor);

  return buildTicketExportSvg({
    backgroundColor: trimOrNull(design.backgroundColor) || "#08131D",
    backgroundGradient:
      trimOrNull(design.backgroundGradient && design.backgroundGradient.from) &&
      trimOrNull(design.backgroundGradient && design.backgroundGradient.to)
        ? {
            from: trimOrNull(design.backgroundGradient.from) || "#08131D",
            to: trimOrNull(design.backgroundGradient.to) || "#123F2D",
            angle: design.backgroundGradient.angle,
          }
        : null,
    backgroundImageUrl: trimOrNull(design.backgroundImageUrl),
    accentColor: trimOrNull(design.accentColor) || "#39C98B",
    textColor,
    subTextColor: trimOrNull(design.subTextColor) || "rgba(255,255,255,0.68)",
    title: trimOrNull(liveContent.title) || trimOrNull(archivedContent.title) || "Event ticket",
    date: trimOrNull(liveContent.date) || trimOrNull(archivedContent.date) || "Date TBD",
    time: trimOrNull(liveContent.time) || trimOrNull(archivedContent.time) || "Time TBD",
    location: trimOrNull(liveContent.location) || trimOrNull(archivedContent.location) || "Location TBD",
    guest: trimOrNull(liveContent.guest) || trimOrNull(archivedContent.guest) || "Guest",
    type: trimOrNull(liveContent.type) || trimOrNull(archivedContent.type) || "Standard",
    footerLabel: trimOrNull(liveContent.footerLabel) || trimOrNull(archivedContent.footerLabel) || "Event Ticket",
    pattern: trimOrNull(design.pattern) || "none",
    logoDataUrl: trimOrNull(design.logoDataUrl),
    qrColor,
    qrPanelColor,
    ticketCode: trimOrNull(liveContent.ticketCode) || trimOrNull(archivedContent.ticketCode) || "TKT-SAMPLE-0001",
    qrDataUrl: trimOrNull(liveContent.qrDataUrl),
    canvasPresetId: design.canvasPresetId || "ticket-landscape",
    layers: Array.isArray(design.layers) ? design.layers : undefined,
  });
}

module.exports = {
  buildArchivedBuilderTicketSvg,
};
