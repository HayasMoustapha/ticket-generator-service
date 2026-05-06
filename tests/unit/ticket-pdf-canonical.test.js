const fs = require('fs').promises;
const os = require('os');
const path = require('path');

jest.mock('../../src/config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

jest.mock('../../../shared/clients/notification-client', () => ({}));

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(async () => Buffer.from('qr-buffer')),
}));

jest.mock('../../src/core/templates/html-template.service', () => ({
  prepareTemplate: jest.fn(),
  loadTemplateContent: jest.fn(),
  renderSvgToPdf: jest.fn(),
  renderTemplateToPdf: jest.fn(),
  findFileRecursive: jest.fn(),
}));

const htmlTemplateService = require('../../src/core/templates/html-template.service');
const canonicalTicketGenerationService = require('../../src/services/ticket-generation.service');
const pdfService = require('../../src/core/pdf/pdf.service');
const { buildArchivedBuilderTicketSvg } = require('../../src/core/templates/builder-pdf-renderer');

describe('ticket PDF canonical rendering', () => {
  let tempDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticket-builder-manifest-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers archived builder manifests over raw template.svg placeholders', async () => {
    const templateSvgPath = path.join(tempDir, 'template.svg');
    const manifestPath = path.join(tempDir, 'manifest.json');

    await fs.writeFile(
      templateSvgPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="420"><text x="20" y="40">LEGACY TEMPLATE SHOULD NOT WIN</text></svg>',
      'utf8',
    );
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          builder: {
            design: {
              backgroundColor: '#08131D',
              accentColor: '#39C98B',
              textColor: '#FFFFFF',
              subTextColor: 'rgba(255,255,255,0.68)',
              pattern: 'none',
              canvasPresetId: 'ticket-landscape',
            },
            content: {
              title: 'Archived Title',
              date: '2026-01-01',
              time: '18:00',
              location: 'Archived Location',
              guest: 'Archived Guest',
              type: 'Archived Type',
              footerLabel: 'Archived Footer',
              ticketCode: 'ARCHIVED-CODE-001',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    htmlTemplateService.prepareTemplate.mockResolvedValue({
      workingDir: tempDir,
      templateRoot: tempDir,
      indexPath: null,
      svgPath: templateSvgPath,
      previewPath: null,
    });
    htmlTemplateService.findFileRecursive.mockImplementation(async (_rootDir, filename) => {
      if (filename === 'manifest.json') {
        return manifestPath;
      }
      return null;
    });

    let capturedSvg = null;
    htmlTemplateService.renderSvgToPdf.mockImplementation(async (svgMarkup) => {
      capturedSvg = svgMarkup;
      return Buffer.from('pdf-buffer');
    });

    const enrichedTicket = {
      ticket_id: '42',
      ticket_code: 'TKT-BUILDER-001',
      qr_code_data: 'TKT-BUILDER-001',
      status: 'active',
      created_at: '2026-06-14T18:00:00.000Z',
      guest: {
        id: '7',
        first_name: 'Mireille',
        last_name: 'Tchoumi',
        email: 'mireille@example.com',
      },
      ticket_type: {
        name: 'VIP',
        price: 150,
      },
      event: {
        id: '11',
        title: 'Builder Summit',
        date: '2026-06-14T18:00:00.000Z',
        location: 'Douala Conference Center',
        organizer_name: 'Governor Organizer',
      },
      template: {
        source_files_path: tempDir,
      },
    };

    const artifact = await canonicalTicketGenerationService.generatePDFArtifact(enrichedTicket);

    expect(artifact.renderMode).toBe('archived-builder-manifest');
    expect(artifact.renderEngine).toBe('chromium-svg-fallback-pdf');
    expect(artifact.pdfBuffer.equals(Buffer.from('pdf-buffer'))).toBe(true);
    expect(capturedSvg).toContain('Builder Summit');
    expect(capturedSvg).toContain('Mireille Tchoumi');
    expect(capturedSvg).toContain('Hosted by Governor Organizer');
    expect(capturedSvg).toContain('TKT-BUILDER-001');
    expect(capturedSvg).not.toContain('ARCHIVED-CODE-001');
    expect(capturedSvg).not.toContain('LEGACY TEMPLATE SHOULD NOT WIN');
  });

  it('makes direct PDF generation reuse the canonical artifact path', async () => {
    const artifactSpy = jest.spyOn(canonicalTicketGenerationService, 'generatePDFArtifact').mockResolvedValue({
      pdfBuffer: Buffer.from('pdf-direct'),
      renderMode: 'archived-builder-manifest',
      renderEngine: 'chromium-svg-fallback-pdf',
    });

    const result = await pdfService.generateTicketPDF(
      {
        id: '99',
        ticketCode: 'TKT-DIRECT-099',
        type: 'Backstage',
        price: 220,
        template: {
          source_files_path: 'C:/tmp/template-package.zip',
        },
      },
      {
        id: '77',
        title: 'Direct PDF Event',
        eventDate: '2026-07-01T19:30:00.000Z',
        location: 'Yaounde Arena',
      },
      {
        id: '15',
        first_name: 'Amina',
        last_name: 'Ngono',
        email: 'amina@example.com',
      },
    );

    expect(result.success).toBe(true);
    expect(result.renderMode).toBe('archived-builder-manifest');
    expect(result.renderEngine).toBe('chromium-svg-fallback-pdf');
    expect(result.pdfBase64).toBe(Buffer.from('pdf-direct').toString('base64'));
    expect(artifactSpy).toHaveBeenCalledTimes(1);
    expect(artifactSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '99',
        ticket_code: 'TKT-DIRECT-099',
        type: 'Backstage',
        template: {
          source_files_path: 'C:/tmp/template-package.zip',
        },
        event: expect.objectContaining({
          title: 'Direct PDF Event',
          location: 'Yaounde Arena',
        }),
        guest: expect.objectContaining({
          first_name: 'Amina',
          last_name: 'Ngono',
          name: 'Amina Ngono',
        }),
      }),
      {},
    );

    artifactSpy.mockRestore();
  });

  it('supports scoped placeholders while keeping recipient data out of archived builder fallbacks', () => {
    const svg = buildArchivedBuilderTicketSvg({
      builderConfig: {
        design: {
          backgroundColor: '#08131D',
          accentColor: '#39C98B',
          textColor: '#FFFFFF',
          subTextColor: 'rgba(255,255,255,0.68)',
          pattern: 'none',
          canvasPresetId: 'ticket-landscape',
        },
        content: {
          title: 'Archived Global Title',
          guest: 'Archived Sample Guest',
          ticketCode: 'ARCHIVED-CODE-999',
          type: 'Archived Sample Type',
          footerLabel: 'Archived Footer',
        },
      },
      globalContent: {
        title: 'Live Global Title',
        date: '2026-10-01',
        time: '19:30',
        location: 'Douala',
        footerLabel: 'Live Footer',
      },
      recipientContent: {
        guest: '',
        type: '',
        ticketCode: '',
        qrDataUrl: null,
      },
    });

    expect(svg).toContain('Live Global Title');
    expect(svg).toContain('Live Footer');
    expect(svg).toContain('>Guest<');
    expect(svg).toContain('>ARCHIVED SAMPLE TYPE<');
    expect(svg).toContain('ARCHIVED-CODE-999');
    expect(svg).not.toContain('Archived Sample Guest');
  });

  it('limits archived builder recipient overrides to approved dynamic fields', () => {
    const svg = buildArchivedBuilderTicketSvg({
      builderConfig: {
        design: {
          backgroundColor: '#08131D',
          accentColor: '#39C98B',
          textColor: '#FFFFFF',
          subTextColor: 'rgba(255,255,255,0.68)',
          pattern: 'none',
          canvasPresetId: 'ticket-landscape',
        },
        content: {
          title: 'Archived Global Title',
          guest: 'Archived Sample Guest',
          ticketCode: 'ARCHIVED-CODE-999',
          type: 'Archived Sample Type',
          footerLabel: 'Archived Footer',
        },
      },
      globalContent: {
        title: 'Live Global Title',
        date: '2026-10-01',
        time: '19:30',
        location: 'Douala',
        footerLabel: 'Live Footer',
      },
      recipientContent: {
        guest: 'Live Guest Name',
        type: 'Backstage',
        ticketCode: 'LIVE-CODE-123',
        qrDataUrl: 'data:image/png;base64,qrpayload',
      },
      recipientDynamicFields: ['guest', 'qrDataUrl'],
    });

    expect(svg).toContain('Live Guest Name');
    expect(svg).toContain('ARCHIVED-CODE-999');
    expect(svg).toContain('ARCHIVED SAMPLE TYPE');
    expect(svg).not.toContain('LIVE-CODE-123');
    expect(svg).not.toContain('BACKSTAGE');
    expect(svg).toContain('data:image/png;base64,qrpayload');
  });

  it('keeps explicitly static archived builder bindings frozen at runtime', () => {
    const svg = buildArchivedBuilderTicketSvg({
      builderConfig: {
        design: {
          backgroundColor: '#08131D',
          accentColor: '#39C98B',
          textColor: '#FFFFFF',
          subTextColor: 'rgba(255,255,255,0.68)',
          pattern: 'none',
          canvasPresetId: 'ticket-landscape',
          layers: [
            {
              id: 'title',
              binding: 'title',
              kind: 'title',
              label: 'Title',
              dynamicField: null,
              x: 42,
              y: 98,
              width: 446,
              height: 78,
              fontSize: 42,
              fontWeight: 800,
              align: 'left',
              opacity: 1,
              radius: 10,
              visible: true,
              locked: false,
            },
            {
              id: 'guest',
              binding: 'guest',
              kind: 'guest',
              label: 'Guest block',
              dynamicField: 'guest_name',
              dynamicMaxLines: 2,
              x: 42,
              y: 284,
              width: 282,
              height: 78,
              fontSize: 30,
              fontWeight: 800,
              align: 'left',
              opacity: 1,
              radius: 10,
              visible: true,
              locked: false,
            },
            {
              id: 'type',
              binding: 'type',
              kind: 'type',
              label: 'Type badge',
              dynamicField: null,
              x: 42,
              y: 344,
              width: 220,
              height: 36,
              fontSize: 15,
              fontWeight: 800,
              align: 'left',
              opacity: 1,
              radius: 10,
              visible: true,
              locked: false,
            },
            {
              id: 'code',
              binding: 'code',
              kind: 'code',
              label: 'Ticket code',
              dynamicField: null,
              x: 42,
              y: 392,
              width: 240,
              height: 22,
              fontSize: 14,
              fontWeight: 700,
              align: 'left',
              opacity: 1,
              radius: 10,
              visible: true,
              locked: false,
            },
          ],
        },
        content: {
          title: 'Archived Static Title',
          guest: 'Archived Guest',
          type: 'Archived Type',
          ticketCode: 'ARCHIVED-CODE-001',
          footerLabel: 'Archived Footer',
        },
      },
      globalContent: {
        title: 'Live Global Title',
        date: '2026-10-01',
        time: '19:30',
        location: 'Douala',
        footerLabel: 'Live Footer',
      },
      recipientContent: {
        guest: 'Live Guest Name',
        type: 'Backstage',
        ticketCode: 'LIVE-CODE-123',
        qrDataUrl: null,
      },
    });

    expect(svg).toContain('Archived Static');
    expect(svg).toContain('Title');
    expect(svg).not.toContain('Live Global Title');
    expect(svg).toContain('Live Guest Name');
    expect(svg).toContain('ARCHIVED-CODE-001');
    expect(svg).not.toContain('LIVE-CODE-123');
    expect(svg).toContain('ARCHIVED TYPE');
    expect(svg).not.toContain('BACKSTAGE');
  });

  it('renders custom text layers tagged as guest_name from recipient data', () => {
    const svg = buildArchivedBuilderTicketSvg({
      builderConfig: {
        design: {
          backgroundColor: '#08131D',
          accentColor: '#39C98B',
          textColor: '#FFFFFF',
          subTextColor: 'rgba(255,255,255,0.68)',
          pattern: 'none',
          canvasPresetId: 'ticket-landscape',
          layers: [
            {
              id: 'guest-dynamic-copy',
              binding: 'footer',
              kind: 'custom-text',
              label: 'Guest copy',
              customText: 'Archived placeholder',
              dynamicField: 'guest_name',
              dynamicMaxLines: 2,
              x: 42,
              y: 284,
              width: 282,
              height: 78,
              fontSize: 30,
              fontWeight: 800,
              align: 'left',
              rotation: 0,
              radius: 0,
              visible: true,
              opacity: 1,
              fillColor: '#FFFFFF',
            },
          ],
        },
        content: {
          title: 'Archived Global Title',
        },
      },
      globalContent: {
        title: 'Live Global Title',
        date: '2026-10-01',
        time: '19:30',
        location: 'Douala',
        footerLabel: 'Live Footer',
      },
      recipientContent: {
        guest: 'Dynamic Guest Layer',
        qrDataUrl: null,
      },
      recipientDynamicFields: ['guest', 'qrDataUrl'],
    });

    expect(svg).toContain('Dynamic Guest');
    expect(svg).toContain('Layer');
    expect(svg).not.toContain('Archived placeholder');
  });

  it('replaces scoped template placeholders for global and recipient fields', () => {
    const html = canonicalTicketGenerationService.replaceTemplateVariables(
      '<div>{{GLOBAL.EVENT_TITLE}} / {{RECIPIENT.GUEST_NAME}} / <img src="{{RECIPIENT.QR_CODE}}" /></div>',
      {
        EVENT_TITLE: 'Legacy Flat Title',
        GUEST_NAME: 'Legacy Flat Guest',
        QR_CODE: 'data:image/png;base64,flat',
      },
      {
        GLOBAL: {
          EVENT_TITLE: 'Scoped Event Title',
        },
        RECIPIENT: {
          GUEST_NAME: 'Scoped Guest Name',
          QR_CODE: 'data:image/png;base64,scoped',
        },
      },
    );

    expect(html).toContain('Scoped Event Title');
    expect(html).toContain('Scoped Guest Name');
    expect(html).toContain('src="data:image/png;base64,scoped"');
    expect(html).not.toContain('{{GLOBAL.EVENT_TITLE}}');
    expect(html).not.toContain('{{RECIPIENT.GUEST_NAME}}');
  });
});
