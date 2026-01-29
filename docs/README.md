# 🎫 TICKET GENERATOR SERVICE - DOCUMENTATION

## 🎯 Présentation

Le **Ticket Generator Service** est un service spécialisé dans la génération de tickets sécurisés avec QR codes et PDF pour la plateforme Event Planner SaaS.

### Rôle principal
- 🎫 **Génération de tickets** : QR codes anti-fraude, PDF personnalisés
- 📊 **Traitement par lot** : Génération en masse pour les événements
- 🔒 **Sécurité** : Codes uniques, validation anti-contrefaçon
- 📱 **Multi-format** : PDF, QR codes, tickets numériques

### Caractéristiques techniques
```
🚀 Port : 3004
🔧 Stack : Node.js + Express + PostgreSQL
📄 Génération : PDF (Puppeteer), QR codes (qrcode)
🗄️ Base : PostgreSQL avec logs de génération
📊 Monitoring : Logs détaillés + métriques
```

## 🏗️ Architecture

### Stack Technique
```
┌─────────────────────────────────────────┐
│         TICKET GENERATOR SERVICE         │
├─────────────────────────────────────────┤
│ 📦 Node.js + Express.js                  │
│ 🗄️ PostgreSQL (logs + tracking)          │
│ 📄 Puppeteer (génération PDF)            │
│ 📱 qrcode (génération QR)                 │
│ 🎨 Handlebars (templates)                │
│ 📊 Winston (logs)                        │
└─────────────────────────────────────────┘
```

### Flow de génération
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Core      │───▶│   Queue     │───▶│  Generator  │
│   Service   │    │   Redis     │    │   Worker    │
└─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Database  │    │   Storage   │
                   │ PostgreSQL  │    │  File System│
                   └─────────────┘    └─────────────┘
```

## ⚡ Fonctionnalités

### 🎫 Génération de tickets

#### Génération individuelle
```javascript
POST /api/tickets/generate
{
  "guestId": 123,
  "eventId": 456,
  "templateId": 1,
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "ticketType": "VIP"
  }
}
```

#### Génération en lot
```javascript
POST /api/tickets/batch
{
  "eventId": 456,
  "guestIds": [123, 124, 125],
  "templateId": 1,
  "options": {
    "batchId": "batch-789",
    "priority": "high"
  }
}
```

### 📱 QR Codes

#### Génération de QR code
```javascript
// Données du QR code
{
  "ticketId": "TC-2024-123456",
  "eventId": 456,
  "guestId": 123,
  "signature": "sha256-hash",
  "timestamp": "2024-01-01T12:00:00Z"
}

// Options de génération
{
  "size": 200,
  "margin": 2,
  "color": {
    "dark": "#000000",
    "light": "#FFFFFF"
  },
  "errorCorrectionLevel": "H"
}
```

### 📄 Templates PDF

#### Structure du template
```handlebars
<!-- templates/ticket.hbs -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Ticket - {{eventName}}</title>
    <style>
        .ticket {
            width: 600px;
            margin: 0 auto;
            border: 2px solid #333;
            padding: 20px;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        .qr-code {
            text-align: center;
            margin: 20px 0;
        }
        .guest-info {
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <h1>{{eventName}}</h1>
            <p>{{eventDate}} - {{location}}</p>
        </div>
        
        <div class="guest-info">
            <h2>{{firstName}} {{lastName}}</h2>
            <p><strong>Email:</strong> {{email}}</p>
            <p><strong>Type:</strong> {{ticketType}}</p>
        </div>
        
        <div class="qr-code">
            <img src="{{qrCodeUrl}}" alt="QR Code">
            <p><small>{{ticketCode}}</small></p>
        </div>
        
        <div class="footer">
            <p><small>Généré le {{generatedAt}}</small></p>
        </div>
    </div>
</body>
</html>
```

## 🗄️ Base de données

### Schéma principal
```sql
-- Logs de génération
CREATE TABLE ticket_generation_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    message TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tickets générés
CREATE TABLE generated_tickets (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL,
    ticket_code VARCHAR UNIQUE NOT NULL,
    qr_code_data TEXT,
    template_id BIGINT,
    guest_id BIGINT,
    event_id BIGINT,
    pdf_file_path VARCHAR,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Index de performance
```sql
CREATE INDEX idx_generation_logs_job_id ON ticket_generation_logs(job_id);
CREATE INDEX idx_generated_tickets_job_id ON generated_tickets(job_id);
CREATE INDEX idx_generated_tickets_code ON generated_tickets(ticket_code);
CREATE INDEX idx_generated_tickets_event_id ON generated_tickets(event_id);
```

## 📚 API Reference

### Endpoints principaux

#### POST /api/tickets/generate
```javascript
// Request
{
  "guestId": 123,
  "eventId": 456,
  "templateId": 1,
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com"
  }
}

// Response
{
  "success": true,
  "data": {
    "ticketId": 789,
    "ticketCode": "TC-2024-123456",
    "qrCodeUrl": "https://api.example.com/qr/789",
    "pdfUrl": "https://api.example.com/pdf/789",
    "generatedAt": "2024-01-01T12:00:00Z"
  }
}
```

#### POST /api/tickets/batch
```javascript
// Request
{
  "eventId": 456,
  "guestIds": [123, 124, 125],
  "templateId": 1,
  "options": {
    "batchId": "batch-789",
    "priority": "high"
  }
}

// Response
{
  "success": true,
  "data": {
    "batchId": "batch-789",
    "jobId": 789,
    "totalCount": 3,
    "status": "processing",
    "estimatedCompletion": "2024-01-01T12:05:00Z"
  }
}
```

#### GET /api/tickets/:ticketId
```javascript
// Response
{
  "success": true,
  "data": {
    "id": 789,
    "ticketCode": "TC-2024-123456",
    "qrCodeData": "base64-encoded-qr",
    "pdfUrl": "https://api.example.com/pdf/789",
    "guest": {
      "id": 123,
      "firstName": "John",
      "lastName": "Doe"
    },
    "event": {
      "id": 456,
      "title": "Tech Conference 2024"
    },
    "generatedAt": "2024-01-01T12:00:00Z"
  }
}
```

#### GET /api/batches/:batchId/status
```javascript
// Response
{
  "success": true,
  "data": {
    "batchId": "batch-789",
    "status": "completed",
    "totalCount": 3,
    "processedCount": 3,
    "failedCount": 0,
    "startedAt": "2024-01-01T12:00:00Z",
    "completedAt": "2024-01-01T12:03:00Z",
    "tickets": [
      {
        "ticketId": 789,
        "ticketCode": "TC-2024-123456",
        "status": "generated"
      }
    ]
  }
}
```

### Health checks
```javascript
GET /health
{
  "status": "healthy",
  "service": "ticket-generator",
  "version": "1.0.0",
  "uptime": 3600
}

GET /health/detailed
{
  "status": "healthy",
  "dependencies": {
    "database": true,
    "storage": true
  },
  "queues": {
    "ticket-generation": {
      "waiting": 5,
      "active": 2
    }
  }
}
```

## 🚀 Guide de déploiement

### Prérequis
```bash
Node.js 18+
PostgreSQL 14+
Puppeteer dependencies
```

### Configuration
```bash
# .env
NODE_ENV=production
PORT=3004

# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=event_planner_tickets
DB_USER=ticket_user
DB_PASSWORD=secure_password

# Stockage
UPLOAD_PATH=./uploads/tickets
MAX_FILE_SIZE=10485760  # 10MB

# Templates
TEMPLATES_PATH=./templates

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs
```

### Docker
```dockerfile
FROM node:18-alpine

# Installation Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Dossiers nécessaires
RUN mkdir -p logs uploads/tickets templates

# Utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3004

CMD ["npm", "start"]
```

### Docker Compose
```yaml
services:
  ticket-generator:
    build: .
    ports: ["3004:3004"]
    environment:
      - DB_HOST=postgres
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    depends_on: [postgres]
```

## 📊 Monitoring

### Logs structurés
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "service": "ticket-generator",
  "message": "Ticket generated successfully",
  "data": {
    "ticketId": 789,
    "ticketCode": "TC-2024-123456",
    "generationTime": 2500,
    "pdfSize": 1024000
  }
}
```

### Métriques
```javascript
const promClient = require('prom-client');

const ticketsGeneratedCounter = new promClient.Counter({
  name: 'tickets_generated_total',
  help: 'Total number of tickets generated',
  labelNames: ['event_id', 'template_id', 'status']
});

const generationDuration = new promClient.Histogram({
  name: 'ticket_generation_duration_seconds',
  help: 'Time taken to generate tickets',
  buckets: [0.5, 1, 2, 5, 10, 30]
});
```

## 🛠️ Dépannage

### Problèmes courants

#### 1. Échec génération PDF
```bash
# Diagnostic
docker logs ticket-generator | grep "PDF"

# Solution
# Vérifier l'installation Chromium
which chromium-browser
```

#### 2. Performance lente
```bash
# Analyser les temps de génération
npm run perf:test

# Optimiser les templates
# Réduire la complexité CSS
```

#### 3. Stockage saturé
```bash
# Nettoyer anciens fichiers
find uploads/tickets -name "*.pdf" -mtime +30 -delete

# Monitorer l'espace
df -h uploads/
```

## 🎯 Bonnes pratiques

### Sécurité des QR codes
```javascript
// Signature anti-fraude
function generateTicketCode(ticketId, eventId, guestId) {
  const data = `${ticketId}:${eventId}:${guestId}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('hex');
  
  return `TC-${Date.now()}-${signature.substr(0, 8)}`;
}

// Validation
function validateTicketCode(ticketCode) {
  const parts = ticketCode.split('-');
  if (parts.length !== 3) return false;
  
  const [prefix, timestamp, signature] = parts;
  if (prefix !== 'TC') return false;
  
  // Vérifier la signature
  // Vérifier l'âge du ticket
  return true;
}
```

### Gestion des erreurs
```javascript
class TicketGenerationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'TicketGenerationError';
    this.code = code;
    this.details = details;
  }
}

// Utilisation
try {
  await generateTicket(data);
} catch (error) {
  if (error instanceof TicketGenerationError) {
    logger.error('Ticket generation failed', {
      code: error.code,
      details: error.details
    });
  }
}
```

### Optimisation des templates
```handlebars
<!-- Optimisations -->
- Utiliser CSS inline
- Éviter les images externes
- Minimiser les animations
- Tester sur mobile
```

---

**Version** : 1.0.0  
**Port** : 3004  
**Dernière mise à jour** : 29 janvier 2026
