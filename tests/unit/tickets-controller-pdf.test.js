jest.mock('../../src/core/qrcode/qrcode.service', () => ({}));
jest.mock('../../src/core/pdf/pdf.service', () => ({
  generateTicketPDF: jest.fn(),
}));
jest.mock('../../src/services/ticket-generation.service', () => ({
  generatePDFArtifact: jest.fn(),
}));
jest.mock('../../src/core/database/batch.service', () => ({}));

const pdfService = require('../../src/core/pdf/pdf.service');
const ticketGenerationService = require('../../src/services/ticket-generation.service');
const ticketsController = require('../../src/api/controllers/tickets.controller');

function createResponseMock() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    setHeader: jest.fn(),
    send: jest.fn(() => res),
  };

  return res;
}

describe('tickets controller PDF responses', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('returns canonical render metadata on POST /api/tickets/pdf', async () => {
    pdfService.generateTicketPDF.mockResolvedValue({
      success: true,
      filename: 'ticket-99.pdf',
      pdfBuffer: Buffer.from('pdf-buffer'),
      pdfBase64: Buffer.from('pdf-buffer').toString('base64'),
      generatedAt: '2026-04-24T07:00:00.000Z',
      renderMode: 'archived-builder-manifest',
      renderEngine: 'chromium-svg-pdf',
    });

    const req = {
      body: {
        ticketData: {
          id: '99',
          attendeeName: 'Amina Ngono',
          attendeeEmail: 'amina@example.com',
        },
        eventData: {
          id: '77',
          title: 'Controller Event',
          eventDate: '2026-07-01T19:30:00.000Z',
          location: 'Yaounde Arena',
        },
      },
    };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.generatePDF(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ticketId: '99',
          filename: 'ticket-99.pdf',
          renderMode: 'archived-builder-manifest',
          renderEngine: 'chromium-svg-pdf',
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('sets upstream render headers on ticket download', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          ticket_id: '42',
          ticket_code: 'TKT-UPSTREAM-042',
          template: {
            id: '11',
            source_files_path: 'C:/tmp/template-package.zip',
          },
        },
      }),
    });

    ticketGenerationService.generatePDFArtifact.mockResolvedValue({
      pdfBuffer: Buffer.from('upstream-pdf'),
      renderMode: 'archived-builder-manifest',
      renderEngine: 'chromium-svg-pdf',
    });

    const req = {
      params: {
        ticketId: '42',
      },
    };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.downloadTicket(req, res, next);

    expect(ticketGenerationService.generatePDFArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '42',
        ticket_code: 'TKT-UPSTREAM-042',
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('x-event-planner-ticket-render-mode', 'archived-builder-manifest');
    expect(res.setHeader).toHaveBeenCalledWith('x-event-planner-ticket-render-engine', 'chromium-svg-pdf');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('upstream-pdf'));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns canonical render metadata on GET /api/tickets/:ticketId/pdf', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          ticket_id: '52',
          ticket_code: 'TKT-UPSTREAM-052',
          template: {
            id: '19',
            source_files_path: 'C:/tmp/template-package.zip',
          },
        },
      }),
    });

    ticketGenerationService.generatePDFArtifact.mockResolvedValue({
      pdfBuffer: Buffer.from('upstream-json-pdf'),
      renderMode: 'archived-builder-manifest',
      renderEngine: 'chromium-svg-pdf',
    });

    const req = {
      params: {
        ticketId: '52',
      },
    };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.getTicketPDF(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ticketId: '52',
          ticketCode: 'TKT-UPSTREAM-052',
          pdfBase64: Buffer.from('upstream-json-pdf').toString('base64'),
          renderMode: 'archived-builder-manifest',
          renderEngine: 'chromium-svg-pdf',
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
