// Proves controller returns stable error codes (not generic 500) on
// generation/lookup failures, and that delete/regenerate are wired to
// the real batch service with mapped not-found responses.

jest.mock('../../src/core/qrcode/qrcode.service', () => ({}));
jest.mock('../../src/core/pdf/pdf.service', () => ({}));
jest.mock('../../src/services/ticket-generation.service', () => ({
  generatePDFArtifact: jest.fn(),
}));
jest.mock('../../src/core/database/batch.service', () => ({
  deleteTicket: jest.fn(),
  regenerateTicket: jest.fn(),
}));

const ticketGenerationService = require('../../src/services/ticket-generation.service');
const batchService = require('../../src/core/database/batch.service');
const ticketsController = require('../../src/api/controllers/tickets.controller');

function createResponseMock() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    setHeader: jest.fn(),
    send: jest.fn(() => res),
    headersSent: false,
  };
  return res;
}

describe('tickets controller — explicit error UX', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('maps a missing enriched ticket to 404 TICKET_NOT_FOUND (not 500)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'Enriched ticket lookup failed with status 404' }),
    });

    const req = { params: { ticketId: '404' } };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.getTicketPDF(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'TICKET_NOT_FOUND' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('maps a render failure to 502 TICKET_RENDER_FAILED', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { ticket_id: '7', ticket_code: 'TKT-7', template: { id: '1', source_files_path: 'x.zip' } },
      }),
    });
    ticketGenerationService.generatePDFArtifact.mockRejectedValue(new Error('chromium raster render crashed'));

    const req = { params: { ticketId: '7' } };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.downloadTicket(req, res, next);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'TICKET_RENDER_FAILED' }),
      }),
    );
  });

  it('deleteTicket returns 404 when the service reports TICKET_NOT_FOUND', async () => {
    batchService.deleteTicket.mockResolvedValue({ success: false, code: 'TICKET_NOT_FOUND', error: 'nope' });

    const req = { params: { ticketId: '9' } };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.deleteTicket(req, res, next);

    expect(batchService.deleteTicket).toHaveBeenCalledWith('9');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'TICKET_NOT_FOUND' }) }),
    );
  });

  it('deleteTicket returns 200 with real deletion data on success', async () => {
    batchService.deleteTicket.mockResolvedValue({ success: true, data: { ticketId: '9', deletedRows: 1 } });

    const req = { params: { ticketId: '9' } };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.deleteTicket(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ deletedRows: 1 }) }),
    );
  });

  it('regenerateTicket maps TICKET_NOT_FOUND to 404', async () => {
    batchService.regenerateTicket.mockResolvedValue({ success: false, code: 'TICKET_NOT_FOUND', error: 'nope' });

    const req = { params: { ticketId: '9' }, body: {} };
    const res = createResponseMock();
    const next = jest.fn();

    await ticketsController.regenerateTicket(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'TICKET_NOT_FOUND' }) }),
    );
  });
});
