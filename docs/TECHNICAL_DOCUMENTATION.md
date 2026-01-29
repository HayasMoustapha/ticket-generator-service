# 🎫 TICKET GENERATOR SERVICE - DOCUMENTATION TECHNIQUE

## 🎯 Vue d'ensemble

Le **Ticket Generator Service** est le service spécialisé dans la génération de tickets sécurisés avec QR codes et PDF pour la plateforme Event Planner SaaS. Il gère la création de tickets individuels, le traitement par lot, et la personnalisation des templates.

## 🏗️ Architecture Technique

### Stack Technique
```
┌─────────────────────────────────────────┐
│        TICKET GENERATOR SERVICE            │
├─────────────────────────────────────────┤
│ 📦 Node.js + Express.js                  │
│ 🗄️ PostgreSQL (logs, tickets)              │
│ 🔴 Redis (queues, cache)                 │
│ 🎨 Handlebars (templates)                 │
│ 📱️ qrcode (QR codes)                     │
│ 📄 PDFKit (PDF generation)                 │
│ 📊 Bull Queue (job processing)            │
│ 📊 Winston (logs)                        │
└─────────────────────────────────────────┘
```

### Architecture en Couches
```
┌─────────────────────────────────────────┐
│              API LAYER                   │
│  ┌─────────────┬─────────────────────────┐   │
│  │   Routes    │     Controllers        │   │
│  │  (Express)   │    (Business Logic)     │   │
│  └─────────────┴─────────────────────────┘   │
├─────────────────────────────────────────┤
│             SERVICE LAYER                 │
│  ┌─────────────┬─────────────────────────┐   │
│  │   Services   │     Generators        │   │
│  │ (Core Logic) │   (QR/PDF)         │   │
│  └─────────────┴─────────────────────────┘   │
├─────────────────────────────────────────┤
│              QUEUE LAYER                  │
│  ┌─────────────┬─────────────────────────┐   │
│  │   Workers   │     Redis             │   │
│  │ (Async Jobs) │   (Job Storage)       │   │
│  └─────────────┴─────────────────────────┘   │
├─────────────────────────────────────────┤
│              DATA LAYER                   │
│  ┌─────────────┬─────────────────────────┐   │
│  │ PostgreSQL  │        Redis            │   │
│  │ (Tickets)   │      (Cache/Queue)      │   │
│  └─────────────┴─────────────────────────┘   │
└─────────────────────────────────────────┘
```

## 🎫 Génération de Tickets

### 1. Architecture de Génération
```javascript
class TicketGenerator {
  constructor() {
    this.qrGenerator = new QRCodeGenerator();
    this.pdfGenerator = new PDFGenerator();
    this.templateService = new TemplateService();
    this.queue = new Bull('ticket-generation');
  }
  
  async generateTicket(guestId, eventId, ticketTypeId) {
    try {
      // 1. Valider les données
      const validation = await this.validateTicketData(guestId, eventId, ticketTypeId);
      
      // 2. Générer un code unique
      const ticketCode = this.generateUniqueCode();
      
      // 3. Créer le ticket en base de données
      const ticket = await this.ticketRepository.create({
        guestId,
        eventId,
        ticketTypeId,
        ticketCode,
        status: 'generated',
        generatedAt: new Date()
      });
      
      // 4. Mettre en file d'attente pour génération
      await this.queue.add('generate-ticket', {
        ticketId: ticket.id,
        ticketCode,
        guestId,
        eventId,
        ticketTypeId,
        priority: 'normal'
      });
      
      return ticket;
      
    } catch (error) {
      logger.error('Ticket generation failed', {
        guestId,
        eventId,
        ticketTypeId,
        error: error.message
      });
      throw error;
    }
  }
  
  generateUniqueCode() {
    const prefix = 'TKT';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    const checksum = this.generateChecksum(timestamp + random);
    
    return `${prefix}-${timestamp}-${random}-${checksum}`;
  }
  
  generateChecksum(data) {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .substr(0, 8);
  }
}
```

### 2. Génération de QR Codes
```javascript
class QRCodeGenerator {
  constructor() {
    this.qrcode = require('qrcode');
  }
  
  generateSecureQRCode(ticketData) {
    const payload = {
      ticketId: ticketData.id,
      eventId: ticketData.eventId,
      guestId: ticketData.guestId,
      ticketCode: ticketData.ticketCode,
      timestamp: Date.now(),
      signature: this.generateSignature(ticketData),
      checksum: this.generateChecksum(ticketData)
    };
    
    const qrCodeData = JSON.stringify(payload);
    
    return this.qrcode.toDataURL(qrCodeData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }
  
  generateSignature(data) {
    const crypto = require('crypto');
    const secret = process.env.QR_SIGNATURE_SECRET;
    
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(data))
      .digest('hex');
  }
  
  validateQRCode(qrCodeData) {
    try {
      const payload = JSON.parse(qrCodeData);
      
      // Vérifier la signature
      const expectedSignature = this.generateSignature({
        ticketId: payload.ticketId,
        eventId: payload.eventId,
        guestId: payload.guestId,
        ticketCode: payload.ticketCode,
        timestamp: payload.timestamp
      });
      
      if (payload.signature !== expectedSignature) {
        throw new Error('Invalid QR code signature');
      }
      
      // Vérifier l'âge du QR code (24h par défaut)
      const age = Date.now() - payload.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 heures
      
      if (age > maxAge) {
        throw new Error('QR code expired');
      }
      
      return payload;
      
    } catch (error) {
      throw new Error('Invalid QR code format');
    }
  }
}
```

### 3. Génération de PDF
```javascript
class PDFGenerator {
  constructor() {
    this.puppeteer = require('puppeteer');
    this.templateService = new TemplateService();
  }
  
  async generateTicketPDF(ticketData) {
    const browser = await this.puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const template = await this.templateService.getTemplate('ticket');
      const html = template(ticketData);
      
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();
      
      return pdfBuffer;
      
    } catch (error) {
      await browser.close();
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }
  
  async generateBatchPDFs(tickets) {
    const browser = await this.puppeteer.launch({ headless: true });
    
    try {
      const page = await browser.newPage();
      
      // Créer un document HTML avec tous les tickets
      const html = await this.createBatchHTML(tickets);
      await page.setContent(html);
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();
      
      return pdfBuffer;
      
    } catch (error) {
      await browser.close();
      throw new Error(`Batch PDF generation failed: ${error.message}`);
    }
  }
  
  createBatchHTML(tickets) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tickets Batch</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .ticket { 
            border: 1px solid #ddd; 
            margin-bottom: 20px; 
            padding: 15px; 
            page-break-inside: avoid; 
          }
          .header { 
            background: #f8f9fa; 
            padding: 10px; 
            text-align: center; 
            font-weight: bold; 
          }
          .content { 
            display: flex; 
            flex-wrap: wrap; 
          }
          .ticket-info { 
            flex: 1; 
            min-width: 300px; 
            padding: 10px; 
          }
          .qr-code { 
            flex: 1; 
            text-align: center; 
            min-width: 200px; 
          }
        </style>
      </head>
      <body>
        <h1>Tickets - ${tickets.length} tickets</h1>
        ${tickets.map(ticket => `
          <div class="ticket">
            <div class="header">
              <h3>${ticket.eventName}</h3>
              <p>Ticket: ${ticket.ticketCode}</p>
            </div>
            <div class="content">
              <div class="ticket-info">
                <p><strong>Nom:</strong> ${ticket.firstName} ${ticket.lastName}</p>
                <p><strong>Email:</strong> ${ticket.email}</p>
                <p><strong>Type:</strong> ${ticket.ticketType}</p>
              </div>
              <div class="qr-code">
                <img src="${ticket.qrCodeUrl}" alt="QR Code" style="width: 150px; height: 150px;">
              </div>
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }
}
```

## 🔄 Traitement par Lot

### 1. Architecture de Batch Processing
```javascript
class BatchService {
  constructor() {
    this.queue = new Bull('batch-processing');
    this.batchSize = 100; // 100 tickets par batch
    this.concurrency = 5; // 5 batches en parallèle
  }
  
  async processBatch(eventId, guestIds, ticketTypeId) {
    const batches = this.chunkArray(guestIds, this.batchSize);
    
    const jobs = batches.map((batch, index) => ({
      name: `batch-${index}`,
      data: {
        eventId,
        guestIds: batch,
        ticketTypeId,
        priority: 'high'
      }
    }));
    
    const results = await Promise.allSettled(
      jobs.map(job => this.queue.add('process-batch', job.data, {
        attempts: 3,
        backoff: 'exponential'
      })
    );
    
    return {
      batchId: `batch-${Date.now()}`,
      totalBatches: batches.length,
      results: results.map((result, index) => ({
        batchIndex: index,
        status: result.status === 'fulfilled' ? 'completed' : 'failed',
        data: result.status === 'fulfilled' ? result.value : null
      }))
    };
  }
  
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 2 Worker Asynchrone
```javascript
// Worker pour la génération de tickets
ticketGenerationQueue.process('generate-ticket', async (job) => {
  const { ticketId, ticketCode, guestId, eventId, ticketTypeId } = job.data;
  
  try {
    // Récupérer les données
    const ticket = await ticketRepository.findById(ticketId);
    const guest = await guestRepository.findById(guestId);
    const event = await eventRepository.findById(eventId);
    const ticketType = await ticketTypeRepository.findById(ticketTypeId);
    
    // Générer le QR code
    const qrCodeUrl = await qrGenerator.generateSecureQRCode({
      id: ticket.id,
      eventId: event.id,
      guestId: guest.id,
      ticketCode: ticket.ticketCode
    });
    
    // Générer le PDF
    const pdfBuffer = await pdfGenerator.generateTicketPDF({
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      guest,
      event,
      ticketType,
      qrCodeUrl
    });
    
    // Sauvegarder le PDF
    const pdfPath = await savePDF(pdfBuffer, ticket.ticketCode);
    
    // Mettre à jour le ticket
    await ticketRepository.update(ticketId, {
      qrCodeData: qrCodeUrl,
      pdfPath: pdfPath,
      status: 'generated',
      generatedAt: new Date()
    });
    
    // Notifier le Core Service
    await coreService.ticketGenerated({
      ticketId: ticket.id,
      guestId: guest.id,
      eventId: event.id
    });
    
    job.progress(100);
    
    return { success: true, ticketId: ticket.id };
    
  } catch (error) {
    job.progress(0);
    throw error;
  }
});
```

## 🎨 Templates Personnalisés

### 1 Système de Templates
```javascript
class TemplateService {
  constructor() {
    this.templates = new Map();
    this.templatePath = path.join(__dirname, '../templates');
  }
  
  async getTemplate(templateName) {
    // Vérifier le cache
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName);
    }
    
    // Charger depuis le système de fichiers
    const templateFile = path.join(this.templatePath, `${templateName}.html`);
    
    try {
      const template = fs.readFileSync(templateFile, 'variables
      const compiled = handlebars.compile(template);
      
      // Mettre en cache
      this.templates.set(templateName, compiled);
      
      return compiled;
    } catch (error) {
      throw new TemplateError(`Template not found: ${templateName}`);
    }
  }
  
  async renderTemplate(templateName, data) {
    const template = await this.getTemplate(templateName);
    return template(data);
  }
  
  async renderWithLocale(templateName, data, locale = 'fr') {
    const localizedTemplateName = `${templateName}_${locale}`;
    
    try {
      return await this.getTemplate(localizedTemplateName);
    } catch (error) {
      // Fallback vers le template par défaut
      return await this.getTemplate(templateName);
    }
  }
}
```

### 2. Variables de Template
```handlebars
<!-- Template: ticket.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{eventName}} - Ticket</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .ticket { 
            border: 2px solid #007bff; 
            padding: 20px; 
            max-width: 600px; 
            margin: 0 auto; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
        }
        .header { 
            background: #007bff; 
            color: white; 
            text-align: center; 
            padding: 20px; 
            border-bottom: 2px solid #0056b3; 
        }
        .content { 
            padding: 20px; 
        }
        .guest-info { 
            margin-bottom: 20px; 
        }
        .qr-code { 
            text-align: center; 
            margin: 20px 0; 
        }
        .footer { 
            border-top: 2px solid #007bff; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
        }
    </style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <h1>{{eventName}}</h1>
            <p>{{eventDate}} - {{location}}</p>
        </div>
        
        <div class="content">
            <div class="guest-info">
                <h2>{{firstName}} {{lastName}}</h2>
                <p><strong>Email:</strong> {{email}}</p>
                <p><strong>Type:</strong> {{ticketType}}</p>
                <p><strong>Code:</strong> {{ticketCode}}</p>
            </div>
            
            <div class="qr-code">
                <img src="{{qrCodeUrl}}" alt="QR Code" style="width: 200px; height: 200px;">
                <p><small>{{ticketCode}}</small></p>
            </div>
        </div>
        
        <div class="footer">
            <p><small>Généré le {{generatedAt}}</small></p>
            <p><small>Code: {{ticketCode}}</small></p>
        </div>
    </div>
</body>
</html>
```

## 📊 Monitoring et Logs

### 1. Métriques de Génération
```javascript
const promClient = require('prom-client');

// Compteurs
const ticketsGeneratedCounter = new promClient.Counter({
  name: 'tickets_generated_total',
  help: 'Total number of tickets generated',
  labelNames: ['event_id', 'template_id', 'status']
});

const batchJobsCounter = new promClient.Counter({
  name: 'batch_jobs_total',
  help: 'Total number of batch jobs processed',
  labelNames: ['status']
});

// Histogrammes
const ticketGenerationDuration = new promClient.Histogram({
  name: 'ticket_generation_duration_seconds',
  help: 'Time taken to generate tickets',
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300]
});

const pdfGenerationDuration = new promClient.Histogram({
  name: 'pdf_generation_duration_seconds',
  help: 'Time taken to generate PDFs',
  buckets: [1, 2, 5, 10, 30, 60, 120, 300]
});

// Jauges
const queueSizeGauge = new promClient.Gauge({
  name: 'ticket_generation_queue_size',
  help: 'Number of tickets in generation queue'
});
```

### 2. Logs Structurés
```javascript
// Format des logs de génération
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "service": "ticket-generator",
  "action": "ticket_generated",
  "data": {
    "ticketId": 123456,
    "ticketCode": "TKT-2024-ABC123",
    "eventId": 789,
    "guestId": 456,
    "generationTime": 2500,
    "pdfSize": 1024000,
    "templateId": 1
  }
}
```

## 🧪 Tests

### 1. Tests d'Intégration
```javascript
describe('Ticket Generation Integration Tests', () => {
  let testUser;
  let testEvent;
  
  beforeAll(async () => {
    testUser = await createTestUser();
    testEvent = await createTestEvent(testUser.id);
  });
  
  test('should generate individual ticket successfully', async () => {
    const ticketData = {
      guestId: testUser.id,
      eventId: testEvent.id,
      ticketTypeId: 1
    };
    
    const response = await request(app)
      .post('/api/tickets/generate')
      .set('Authorization', `Bearer ${await getAuthToken(testUser)}`)
      .send(ticketData)
      .expect(201);
    
    const ticket = response.body.data;
    expect(ticket.ticketCode).toBeDefined();
    expect(ticket.status).toBe('generated');
    expect(ticket.qrCodeUrl).toBeDefined();
  });
  
  test('should process batch ticket generation', async () => {
    const guestIds = [1, 2, 3, 4, 5];
    
    const batchData = {
      eventId: testEvent.id,
      guestIds,
      ticketTypeId: 1,
      priority: 'high'
    };
    
    const response = await request(app)
      .post('/api/tickets/batch')
      .set('Authorization', `Bearer ${await getAuthToken(testUser)}`)
      .send(batchData)
      .expect(202);
    
    const batch = response.body.data;
    expect(batch.totalCount).toBe(5);
    expect(batch.status).toBe('processing');
    
    // Attendre la fin du traitement
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const updatedBatch = await getBatchStatus(batch.batchId);
    expect(updatedBatch.status).toBe('completed');
  });
  
  test('should generate secure QR code', async () => {
    const ticketData = {
      id: 123,
      eventId: 456,
      guestId: 789,
      ticketCode: 'TKT-2024-ABC123'
    };
    
    const qrCode = await qrGenerator.generateSecureQRCode(ticketData);
    
    expect(qrCode).toContain('data:image/png;base64');
    
    // Valider le QR code
    const validatedData = qrGenerator.validateQRCode(qrCode);
    expect(validatedData.ticketId).toBe(123);
    expect(validatedData.eventId).toBe(456);
    expect(validatedData.guestId).toBe(789);
  });
});
```

### 2. Tests de Performance
```javascript
describe('Performance Tests', () => {
  test('should generate 100 tickets within SLA', async () => {
    const startTime = Date.now();
    
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        request(app)
          .post('/api/tickets/generate')
          .send({
            guestId: i + 1,
            eventId: 1,
            ticketTypeId: 1
          })
      );
    }
    
    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    
    expect(results.every(r => r.status === 'fulfilled').toBe(true);
    expect(duration).toBeLessThan(30000); // 30 secondes max
  });
  
  test('should handle 1000 concurrent requests', async () => {
    const promises = [];
    
    for (let i = 0; i < 1000; i++) {
      promises.push(
        request(app)
          .get(`/api/tickets/${i}`)
          .expect(404) // 404 car le ticket n'existe pas
      );
    }
    
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 404).toBe(true);
  });
});
```

## 🚀 Performance

### 1. Optimisations
```javascript
// Pool de navigateurs Puppeteer
class PuppeteerPool {
  constructor() {
    this.browsers = [];
    this.maxSize = 5;
    this.currentIndex = 0;
  }
  
  async getBrowser() {
    if (this.browsers.length > 0) {
      return this.browsers.pop();
    }
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.browsers.push(browser);
    return browser;
  }
  
  releaseBrowser(browser) {
    if (this.browsers.length < this.maxSize) {
      this.browsers.push(browser);
    }
  }
}

// Cache des templates
class TemplateCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 3600; // 1 heure
  }
  
  async get(templateName) {
    if (this.cache.has(templateName)) {
      const cached = this.cache.get(templateName);
      
      // Vérifier si le cache est encore valide
      if (Date.now() - cached.timestamp < this.ttl) {
        return cached.template;
      }
    }
    
    // Recharger le template
    const template = await this.loadTemplate(templateName);
    this.cache.set(templateName, {
      template,
      timestamp: Date.now()
    });
    
    return template;
  }
}
```

### 2. Benchmarks Cibles
```
🎯 Performance cibles :
- Ticket generation : < 2s (P95)
- QR code generation : < 100ms (P95)
- PDF generation : < 3s (P95)
- Batch processing : 100 tickets/batch < 30s
- Concurrent generation : 500/min
- QR code validation : < 10ms
```

## 🔧 Configuration

### Variables d'Environnement Clés
```bash
# Service
PORT=3004
NODE_ENV=production

# Base de données
DB_HOST=localhost
DB_NAME=event_planner_tickets
DB_POOL_MIN=3
DB_POOL_MAX=15

# Redis
REDIS_HOST=localhost
REDIS_QUEUE_HOST=localhost
REDIS_QUEUE_PORT=6379
REDIS_QUEUE_PASSWORD=your_redis_password

# QR Codes
QR_SIGNATURE_SECRET=your_qr_signature_secret
QR_EXPIRY_HOURS=24
QR_SIZE=200
QR_MARGIN=2

# PDF Generation
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_ARGS=--no-sandbox --disable-setuid-sandbox

# Templates
TEMPLATES_PATH=./templates
TEMPLATE_CACHE_TTL=3600
MAX_FILE_SIZE=10485760  # 10MB

# Queue
QUEUE_CONCURRENCY=5
QUEUE_RETRY_ATTEMPTS=3
QUEUE_RETRY_DELAY=2000
```

## 📈 Vision Future

### 1. Évolutions Prévues
- **NFC Support** : Tickets NFC
- **Digital Wallets** : Wallets numériques
- **Blockchain** : Tickets sur blockchain
- **AR/VR** : Tickets augmentés réalité virtuelle
- **Dynamic Templates** : Templates dynamiques
- **Real-time Updates** : Mises à jour en temps réel

### 2. Architecture Cible
```
┌─────────────────────────────────────────┐
│         FUTURE TICKET ARCHITECTURE        │
├─────────────────────────────────────────┤
│  ┌─────────────┬─────────────┬─────────────┐   │
│  │   Digital   │   NFC       │   AR/VR     │   │
│  │   Wallet  │   Wallet    │   Wallet     │   │
│   │   Service │   Service   │   Service    │   │
│  └─────────────┴─────────────┴─────────────┘   │
├─────────────────────────────────────────┤
│              GENERATION LAYER               │
│  ┌─────────────────────────────────────┐   │
│  │   AI/ML     │   Analytics   │   Analytics   │   │
│  │   Engine    │   Engine     │   Engine     │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────┘
```

---

## 📋 Conclusion

Le Ticket Generator Service est conçu pour être :
- **Sécurisé** : QR codes avec signature cryptographique
- **Scalable** : Traitement par lot et asynchrone
- **Personnalisable** : Système de templates flexible
- **Performant** : Optimisé pour les volumes élevés

Il garantit la création fiable et sécurisée des tickets pour toute la plateforme Event Planner SaaS.

---

**Version** : 1.0.0  
**Port** : 3004  
**Dernière mise à jour** : 29 janvier 2026
