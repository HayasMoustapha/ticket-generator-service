const request = require('supertest');
const app = require('../../src/server');

describe('Tickets API Integration Tests', () => {
  let testTicket = {
    id: 'test-ticket-123',
    eventId: 'test-event-456',
    userId: 'test-user-789',
    type: 'standard',
    price: 1000
  };

  let testEvent = {
    id: 'test-event-456',
    title: 'Test Event Integration',
    eventDate: new Date().toISOString(),
    location: 'Test Location'
  };

  let testUser = {
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    phone: '+33612345678'
  };

  beforeAll(async () => {
    // Attendre l'initialisation du serveur
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'ticket-generator');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body).toHaveProperty('system');
    });

    it('should return ready status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should return live status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
    });
  });

  describe('POST /api/tickets/generate', () => {
    it('should generate a ticket successfully', async () => {
      const response = await request(app)
        .post('/api/tickets/generate')
        .send({
          ticketData: testTicket,
          options: {
            qrOptions: {
              width: 200,
              margin: 1
            }
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ticketId', testTicket.id);
      expect(response.body.data).toHaveProperty('qrCode');
      expect(response.body.data).toHaveProperty('signature');
      expect(response.body.data).toHaveProperty('generatedAt');
    });

    it('should reject invalid ticket data', async () => {
      const response = await request(app)
        .post('/api/tickets/generate')
        .send({
          ticketData: {
            id: 'test'
            // Données incomplètes
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing ticket data', async () => {
      const response = await request(app)
        .post('/api/tickets/generate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/tickets/batch', () => {
    it('should create a batch job successfully', async () => {
      const tickets = [
        testTicket,
        { ...testTicket, id: 'test-ticket-124' },
        { ...testTicket, id: 'test-ticket-125' }
      ];

      const response = await request(app)
        .post('/api/tickets/batch')
        .send({
          tickets,
          options: {
            priority: 'high'
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('ticketsCount', 3);
      expect(response.body.data).toHaveProperty('status', 'queued');
      expect(response.body.data).toHaveProperty('estimatedDuration');
    });

    it('should reject empty tickets array', async () => {
      const response = await request(app)
        .post('/api/tickets/batch')
        .send({
          tickets: []
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject too many tickets', async () => {
      const tickets = Array(1001).fill().map((_, i) => ({
        ...testTicket,
        id: `test-ticket-${i}`
      }));

      const response = await request(app)
        .post('/api/tickets/batch')
        .send({ tickets });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/tickets/pdf', () => {
    it('should generate PDF successfully', async () => {
      const response = await request(app)
        .post('/api/tickets/pdf')
        .send({
          ticketData: testTicket,
          eventData: testEvent,
          userData: testUser
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ticketId', testTicket.id);
      expect(response.body.data).toHaveProperty('filename');
      expect(response.body.data).toHaveProperty('pdfBase64');
      expect(response.body.data).toHaveProperty('generatedAt');
    });

    it('should reject missing event data', async () => {
      const response = await request(app)
        .post('/api/tickets/pdf')
        .send({
          ticketData: testTicket,
          userData: testUser
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing user data', async () => {
      const response = await request(app)
        .post('/api/tickets/pdf')
        .send({
          ticketData: testTicket,
          eventData: testEvent
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/tickets/batch-pdf', () => {
    it('should create batch PDF job successfully', async () => {
      const tickets = [
        testTicket,
        { ...testTicket, id: 'test-ticket-124' }
      ];

      const response = await request(app)
        .post('/api/tickets/batch-pdf')
        .send({
          tickets,
          eventData: testEvent
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('ticketsCount', 2);
      expect(response.body.data).toHaveProperty('status', 'queued');
    });
  });

  describe('POST /api/tickets/full-batch', () => {
    it('should create full batch job successfully', async () => {
      const tickets = [
        testTicket,
        { ...testTicket, id: 'test-ticket-124' }
      ];

      const response = await request(app)
        .post('/api/tickets/full-batch')
        .send({
          tickets,
          eventData: testEvent,
          options: {
            priority: 'high',
            qrOptions: { width: 200 },
            pdfOptions: { fontSize: 12 }
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('ticketsCount', 2);
      expect(response.body.data).toHaveProperty('estimatedDuration');
    });
  });

  describe('GET /api/tickets/:ticketId/download', () => {
    it('should download ticket PDF', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.id}/download`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should reject missing ticket ID', async () => {
      const response = await request(app)
        .get('/api/tickets//download');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/tickets/:ticketId/qrcode', () => {
    it('should download QR code', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.id}/qrcode`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ticketId', testTicket.id);
      expect(response.body.data).toHaveProperty('qrCode');
      expect(response.body.data).toHaveProperty('signature');
    });
  });

  describe('GET /api/tickets/queue/stats', () => {
    it('should return queue statistics', async () => {
      const response = await request(app)
        .get('/api/tickets/queue/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ticket-generation');
      expect(response.body.data).toHaveProperty('pdf-generation');
      expect(response.body.data).toHaveProperty('batch-processing');
    });
  });

  describe('POST /api/tickets/queue/clean', () => {
    it('should clean completed jobs', async () => {
      const response = await request(app)
        .post('/api/tickets/queue/clean');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cleanedCount');
      expect(response.body.data).toHaveProperty('cleanedAt');
    });
  });

  describe('Job Management', () => {
    let jobId;

    beforeAll(async () => {
      // Créer un job pour les tests
      const response = await request(app)
        .post('/api/tickets/batch')
        .send({
          tickets: [testTicket]
        });
      
      jobId = response.body.data.jobId;
    });

    it('should get job status', async () => {
      const response = await request(app)
        .get(`/api/tickets/job/${jobId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', jobId);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('state');
    });

    it('should cancel job', async () => {
      const response = await request(app)
        .delete(`/api/tickets/job/${jobId}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId', jobId);
      expect(response.body.data).toHaveProperty('cancelled', true);
    });

    it('should handle non-existent job', async () => {
      const response = await request(app)
        .get('/api/tickets/job/non-existent-job/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/tickets/generate')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle oversized payload', async () => {
      const largeData = {
        ticketData: {
          ...testTicket,
          largeField: 'x'.repeat(1000000) // 1MB de données
        }
      };

      const response = await request(app)
        .post('/api/tickets/generate')
        .send(largeData);

      // Le middleware devrait gérer cela
      expect([200, 400, 413]).toContain(response.status);
    });

    it('should handle invalid routes', async () => {
      const response = await request(app)
        .get('/api/tickets/invalid-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow normal requests', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });

    // Note: Les tests de rate limiting sont difficiles à implémenter
    // car ils nécessiteraient de faire beaucoup de requêtes rapidement
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/tickets');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('API Documentation', () => {
    it('should provide API info', async () => {
      const response = await request(app)
        .get('/api');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'Ticket Generator API');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body).toHaveProperty('version');
    });

    it('should provide service info', async () => {
      const response = await request(app)
        .get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'Ticket Generator Service');
      expect(response.body).toHaveProperty('status', 'running');
    });
  });
});
