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
    expect(artifact.renderEngine).toBe('chromium-svg-pdf');
    expect(artifact.pdfBuffer.equals(Buffer.from('pdf-buffer'))).toBe(true);
    expect(capturedSvg).toContain('Builder Summit');
    expect(capturedSvg).toContain('Mireille Tchoumi');
    expect(capturedSvg).toContain('Hosted by Governor Organizer');
    expect(capturedSvg).toContain('TKT-BUILDER-001');
    expect(capturedSvg).not.toContain('LEGACY TEMPLATE SHOULD NOT WIN');
  });

  it('makes direct PDF generation reuse the canonical artifact path', async () => {
    const artifactSpy = jest.spyOn(canonicalTicketGenerationService, 'generatePDFArtifact').mockResolvedValue({
      pdfBuffer: Buffer.from('pdf-direct'),
      renderMode: 'archived-builder-manifest',
      renderEngine: 'chromium-svg-pdf',
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
    expect(result.renderEngine).toBe('chromium-svg-pdf');
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
});
