// Proves batch.service no longer returns mocked data for regenerate/delete:
// it queries the real tables and returns explicit not-found / db errors.

jest.mock('../../src/config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

const { database } = require('../../src/config/database');
const batchService = require('../../src/core/database/batch.service');

describe('batch.service DB operations (no mock data)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('regenerateTicketInDatabase', () => {
    it('returns TICKET_NOT_FOUND when no generated ticket exists', async () => {
      database.query.mockResolvedValueOnce({ rows: [] }); // existence check

      const result = await batchService.regenerateTicketInDatabase('123');

      expect(result.success).toBe(false);
      expect(result.code).toBe('TICKET_NOT_FOUND');
      expect(database.query).toHaveBeenCalledTimes(1);
    });

    it('records a real regeneration log when the ticket exists', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // existence check
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // insert log

      const result = await batchService.regenerateTicketInDatabase('123', {
        reason: 'reprint',
        regenerateQR: true,
        regeneratePDF: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.ticketId).toBe('123');
      expect(result.data.reason).toBe('reprint');
      expect(result.data.regeneratePDF).toBe(false);
      // Second call must be the audit log insert
      const insertSql = database.query.mock.calls[1][0];
      expect(insertSql).toMatch(/INSERT INTO ticket_generation_logs/i);
    });

    it('surfaces a DATABASE_QUERY_ERROR instead of fake success on DB failure', async () => {
      database.query.mockRejectedValueOnce(new Error('connection reset'));

      const result = await batchService.regenerateTicketInDatabase('123');

      expect(result.success).toBe(false);
      expect(result.code).toBe('DATABASE_QUERY_ERROR');
      expect(result.error).toBe('connection reset');
    });
  });

  describe('deleteTicketFromDatabase', () => {
    it('returns TICKET_NOT_FOUND when nothing was deleted', async () => {
      database.query.mockResolvedValueOnce({ rows: [] }); // DELETE ... RETURNING

      const result = await batchService.deleteTicketFromDatabase('555');

      expect(result.success).toBe(false);
      expect(result.code).toBe('TICKET_NOT_FOUND');
    });

    it('performs a real delete and reports deleted rows', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // DELETE
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }); // audit log

      const result = await batchService.deleteTicketFromDatabase('555');

      expect(result.success).toBe(true);
      expect(result.data.deletedRows).toBe(2);
      const deleteSql = database.query.mock.calls[0][0];
      expect(deleteSql).toMatch(/DELETE FROM generated_tickets/i);
    });

    it('surfaces a DATABASE_QUERY_ERROR on DB failure', async () => {
      database.query.mockRejectedValueOnce(new Error('deadlock detected'));

      const result = await batchService.deleteTicketFromDatabase('555');

      expect(result.success).toBe(false);
      expect(result.code).toBe('DATABASE_QUERY_ERROR');
    });
  });
});
