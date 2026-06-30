// ERROR-UX hardening — ticket-generator-service.
// Couvre : (1) le gestionnaire d'erreurs global honore les erreurs client typées
// (statut + code stable) au lieu d'un 500 INTERNAL_SERVER_ERROR systématique ;
// (2) les validations d'entrée des contrôleurs renvoient des 400 explicites ;
// (3) un échec de génération côté service reste codé.

jest.mock('../../src/core/qrcode/qrcode.service', () => ({
  generateTicketQRCode: jest.fn(),
}));
jest.mock('../../src/core/pdf/pdf.service', () => ({}));
jest.mock('../../src/services/ticket-generation.service', () => ({
  generatePDFArtifact: jest.fn(),
}));
jest.mock('../../src/core/database/batch.service', () => ({}));

const qrCodeService = require('../../src/core/qrcode/qrcode.service');
const ticketsController = require('../../src/api/controllers/tickets.controller');
const { buildGlobalErrorHandler } = require('../../src/error/global-error-handler');

function createResponseMock() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader: jest.fn(),
    send: jest.fn(function () { return this; }),
    headersSent: false,
  };
  return res;
}

afterEach(() => jest.clearAllMocks());

describe('global error handler — ERROR-UX', () => {
  const handler = buildGlobalErrorHandler();
  const req = { method: 'GET', url: '/x', ip: '127.0.0.1', get: () => 'jest' };

  it('honors a typed client error (404 + stable code) instead of 500', () => {
    const err = new Error('Ticket introuvable');
    err.statusCode = 404;
    err.code = 'TICKET_NOT_FOUND';

    const res = createResponseMock();
    handler(err, req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TICKET_NOT_FOUND');
    expect(res.body.message).toBe('Ticket introuvable');
  });

  it('honors a typed 422 business error', () => {
    const err = new Error('Template indisponible');
    err.status = 422;
    err.code = 'TEMPLATE_NOT_FOUND';

    const res = createResponseMock();
    handler(err, req, res, jest.fn());

    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('untyped internal fault stays 500 INTERNAL_SERVER_ERROR (generic message in non-dev)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test'; // non-development
    const res = createResponseMock();

    handler(new Error('low-level db crash'), req, res, jest.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.message).toBe('Erreur interne du serveur');
    process.env.NODE_ENV = prev;
  });
});

describe('tickets controller — input validation ERROR-UX', () => {
  it('generateQRCode without ticketCode/ticketId -> 400 INVALID_QR_DATA', async () => {
    const res = createResponseMock();
    await ticketsController.generateQRCode({ body: { ticketId: '1' } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QR_DATA');
    expect(qrCodeService.generateTicketQRCode).not.toHaveBeenCalled();
  });

  it('generateTicket with incomplete ticketData -> 400 INVALID_TICKET_DATA', async () => {
    const res = createResponseMock();
    await ticketsController.generateTicket({ body: { ticketData: { id: '1' } } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TICKET_DATA');
  });

  it('generateBatch with empty list -> 400 EMPTY_BATCH', async () => {
    const res = createResponseMock();
    await ticketsController.generateBatch({ body: { tickets: [] } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_BATCH');
  });

  it('generatePDF without ticketData/eventData -> 400 INVALID_PDF_DATA', async () => {
    const res = createResponseMock();
    await ticketsController.generatePDF({ body: { ticketData: {} } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PDF_DATA');
  });

  it('generateQRCode service failure -> coded QR_GENERATION_FAILED (never uncoded 500)', async () => {
    qrCodeService.generateTicketQRCode.mockResolvedValue({ success: false, error: 'qr lib error' });
    const res = createResponseMock();

    await ticketsController.generateQRCode(
      { body: { ticketCode: 'C1', ticketId: 'T1' } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('QR_GENERATION_FAILED');
  });
});
