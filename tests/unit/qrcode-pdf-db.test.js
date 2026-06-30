// Proves qrcode.service + pdf.service no longer return mocked data from
// getQRCodeFromDatabase / getPDFFromDatabase, and that integrateQRCode
// either embeds a real QR PNG into a fresh PDF or fails explicitly.

const fs = require('fs').promises;

jest.mock('../../src/config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/config/redis', () => ({}));

// pdf.service pulls these in transitively; keep them inert.
jest.mock('../../../shared/clients/notification-client', () => ({}));
jest.mock('../../src/services/ticket-generation.service', () => ({}));
jest.mock('../../src/core/templates/html-template.service', () => ({}));

const { database } = require('../../src/config/database');
const qrCodeService = require('../../src/core/qrcode/qrcode.service');
const pdfService = require('../../src/core/pdf/pdf.service');

describe('qrcode.service.getQRCodeFromDatabase (no mock data)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns null when there is no persisted QR code', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    const result = await qrCodeService.getQRCodeFromDatabase('1');
    expect(result).toBeNull();
  });

  it('returns the real persisted QR code data', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ qr_code_data: 'data:image/png;base64,AAAA', ticket_code: 'TKT-1', generated_at: '2026-06-21T00:00:00Z' }],
    });

    const result = await qrCodeService.getQRCodeFromDatabase('1');

    expect(result.qrCode).toBe('data:image/png;base64,AAAA');
    expect(result.ticketCode).toBe('TKT-1');
    expect(result.format).toBe('data-url');
    expect(result.qrCode).not.toMatch(/mock/);
  });

  it('throws (not silent null) on a DB error', async () => {
    database.query.mockRejectedValueOnce(new Error('db down'));
    await expect(qrCodeService.getQRCodeFromDatabase('1')).rejects.toThrow('db down');
  });
});

describe('pdf.service.getPDFFromDatabase (no mock data)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns null when no pdf_file_path is persisted', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    const result = await pdfService.getPDFFromDatabase('1');
    expect(result).toBeNull();
  });

  it('reads the real PDF file from disk and returns base64', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ pdf_file_path: '/tmp/ticket-1.pdf', ticket_code: 'TKT-1', generated_at: '2026-06-21T00:00:00Z' }],
    });
    const readSpy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(Buffer.from('%PDF-real'));

    const result = await pdfService.getPDFFromDatabase('1');

    expect(readSpy).toHaveBeenCalledWith('/tmp/ticket-1.pdf');
    expect(result.pdfData).toBe(Buffer.from('%PDF-real').toString('base64'));
    expect(result.pdfData).not.toBe('mock_pdf_data');
    readSpy.mockRestore();
  });

  it('throws PDF_FILE_MISSING when the referenced file is gone', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ pdf_file_path: '/tmp/missing.pdf', ticket_code: 'TKT-1', generated_at: '2026-06-21T00:00:00Z' }],
    });
    const readSpy = jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('ENOENT'));

    await expect(pdfService.getPDFFromDatabase('1')).rejects.toThrow(/introuvable/i);
    readSpy.mockRestore();
  });
});

describe('pdf.service.integrateQRCode', () => {
  it('rejects an empty QR buffer explicitly', async () => {
    const result = await pdfService.integrateQRCode(null, Buffer.alloc(0));
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_QR_BUFFER');
  });

  it('fails explicitly when asked to overlay onto an existing rendered PDF', async () => {
    const result = await pdfService.integrateQRCode(Buffer.from('%PDF-existing'), Buffer.from('qr'));
    expect(result.success).toBe(false);
    expect(result.code).toBe('PDF_OVERLAY_UNSUPPORTED');
    // No silent fake-success message anymore
    expect(result.message).toBeUndefined();
  });

  it('embeds a real QR PNG into a fresh standalone PDF', async () => {
    // Build a genuine 1x1 PNG buffer so pdfkit can embed it.
    const QRCode = require('qrcode');
    const qrBuffer = await QRCode.toBuffer('TKT-EMBED', { type: 'png', width: 64, margin: 1 });

    const result = await pdfService.integrateQRCode(null, qrBuffer, { title: 'Ticket' });

    expect(result.success).toBe(true);
    expect(result.hasQRCode).toBe(true);
    expect(Buffer.isBuffer(result.pdfBuffer)).toBe(true);
    // Valid PDF starts with the %PDF- header
    expect(result.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-');
  });
});
