# Ticket Generator Service - API Routes Documentation

## Overview

Le Ticket Generator Service gère la génération de tickets, QR codes, PDFs, et le traitement par lots pour Event Planner.

## Base URL
```
http://localhost:3004/api/tickets
```

## Authentication

Toutes les routes nécessitent une authentification JWT:
```
Authorization: Bearer <token>
```

## Permissions

Les permissions requises pour chaque route sont spécifiées ci-dessous.

---

## 🏠 **Health Routes**

### Health Check
```
GET /api/tickets/health
```
- **Description**: Vérification de santé du service
- **Authentification**: Non requise
- **Permissions**: Aucune
- **Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-25T15:30:00.000Z",
  "service": "ticket-generator",
  "version": "1.0.0",
  "components": {
    "qrcode": "healthy",
    "pdf": "healthy",
    "batch": "healthy",
    "queue": "healthy"
  }
}
```

### Service Info
```
GET /api/tickets/
```
- **Description**: Informations sur le service et endpoints disponibles
- **Authentification**: Requise
- **Permissions**: Aucune
- **Response**:
```json
{
  "service": "Ticket Generator API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "generate": "POST /api/tickets/generate",
    "qrGenerate": "POST /api/tickets/qr/generate",
    "batch": "POST /api/tickets/batch",
    "pdf": "POST /api/tickets/pdf",
    "batchPdf": "POST /api/tickets/batch-pdf",
    "fullBatch": "POST /api/tickets/full-batch",
    "jobStatus": "GET /api/tickets/job/:jobId/status",
    "cancelJob": "DELETE /api/tickets/job/:jobId/cancel",
    "createJob": "POST /api/tickets/jobs",
    "processJob": "POST /api/tickets/jobs/:jobId/process",
    "listJobs": "GET /api/tickets/jobs",
    "download": "GET /api/tickets/:ticketId/download",
    "qrcode": "GET /api/tickets/:ticketId/qrcode",
    "queueStats": "GET /api/tickets/queue/stats",
    "queueClean": "POST /api/tickets/queue/clean",
    "eventTickets": "GET /api/tickets/events/:eventId/tickets",
    "eventStats": "GET /api/tickets/events/:eventId/stats"
  },
  "timestamp": "2024-01-25T15:30:00.000Z"
}
```

---

## 🎫 **Ticket Generation Routes**

### Generate Single Ticket
```
POST /api/tickets/generate
```
- **Description**: Génère un ticket unique
- **Authentification**: Requise
- **Permissions**: `tickets.create`
- **Request Body**:
```json
{
  "eventId": "EVENT-456",
  "ticketType": "standard",
  "quantity": 1,
  "options": {
    "template": "default",
    "includeQR": true,
    "includePDF": false
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Ticket generated successfully",
  "data": {
    "ticketId": "TICKET-123456",
    "eventId": "EVENT-456",
    "ticketType": "standard",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "status": "generated",
    "generatedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Generate QR Code
```
POST /api/tickets/qr/generate
```
- **Description**: Génère un QR code pour un ticket
- **Authentification**: Requise
- **Permissions**: `tickets.create`
- **Request Body**:
```json
{
  "ticketData": {
    "id": "TICKET-123456",
    "eventId": "EVENT-456",
    "type": "standard",
    "metadata": {
      "test": true
    }
  },
  "options": {
    "width": 300,
    "margin": 2,
    "color": {
      "dark": "#000000",
      "light": "#FFFFFF"
    }
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "QR code generated successfully",
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "ticketId": "TICKET-123456",
    "format": "png",
    "size": "300x300"
  }
}
```

### Generate Batch Tickets
```
POST /api/tickets/batch
```
- **Description**: Génère des tickets en lot
- **Authentification**: Requise
- **Permissions**: `tickets.batch.create`
- **Request Body**:
```json
{
  "eventId": "EVENT-456",
  "tickets": [
    {
      "type": "standard",
      "quantity": 100
    },
    {
      "type": "vip",
      "quantity": 50
    }
  ],
  "options": {
    "template": "default",
    "includeQR": true,
    "includePDF": true
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Batch generation started successfully",
  "data": {
    "jobId": "job_1643123456789",
    "totalTickets": 150,
    "status": "processing",
    "estimatedTime": "5 minutes"
  }
}
```

### Generate PDF
```
POST /api/tickets/pdf
```
- **Description**: Génère un PDF pour un ticket
- **Authentification**: Requise
- **Permissions**: `tickets.pdf.create`
- **Request Body**:
```json
{
  "ticketId": "TICKET-123456",
  "template": "default",
  "options": {
    "includeQR": true,
    "includeEventInfo": true,
    "customFields": {
      "notes": "Special access"
    }
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "PDF generated successfully",
  "data": {
    "ticketId": "TICKET-123456",
    "pdfUrl": "/api/tickets/TICKET-123456/download",
    "generatedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Generate Batch PDFs
```
POST /api/tickets/batch-pdf
```
- **Description**: Génère des PDFs en lot
- **Authentification**: Requise
- **Permissions**: `tickets.pdf.batch`
- **Request Body**:
```json
{
  "ticketIds": ["TICKET-123456", "TICKET-123457"],
  "template": "default",
  "options": {
    "includeQR": true,
    "mergeIntoSingle": false
  }
}
```

### Generate Full Batch
```
POST /api/tickets/full-batch
```
- **Description**: Génère un traitement batch complet (QR + PDF)
- **Authentification**: Requise
- **Permissions**: `tickets.full.batch`
- **Request Body**:
```json
{
  "eventId": "EVENT-456",
  "tickets": [
    {
      "type": "standard",
      "quantity": 100,
      "template": "standard"
    }
  ],
  "options": {
    "generateQR": true,
    "generatePDF": true,
    "mergePDFs": true
  }
}
```

---

## 📋 **Job Management Routes**

### Create Job
```
POST /api/tickets/jobs
```
- **Description**: Crée un job de génération
- **Authentification**: Requise
- **Permissions**: `tickets.jobs.create`
- **Request Body**:
```json
{
  "type": "batch_generation",
  "eventId": "EVENT-456",
  "ticketData": [
    {
      "id": "TICKET-123456",
      "type": "standard"
    }
  ],
  "options": {
    "template": "default",
    "includeQR": true
  },
  "priority": "normal"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Job created successfully",
  "data": {
    "id": "job_1643123456789",
    "type": "batch_generation",
    "eventId": "EVENT-456",
    "status": "pending",
    "priority": "normal",
    "createdAt": "2024-01-25T15:30:00.000Z",
    "createdBy": "user-123"
  }
}
```

### Process Job
```
POST /api/tickets/jobs/:jobId/process
```
- **Description**: Traite un job spécifique
- **Authentification**: Requise
- **Permissions**: `tickets.jobs.process`
- **Response**:
```json
{
  "success": true,
  "message": "Job processing started",
  "data": {
    "id": "job_1643123456789",
    "status": "processing",
    "startedAt": "2024-01-25T15:30:00.000Z",
    "processedBy": "user-123"
  }
}
```

### Get Job Status
```
GET /api/tickets/job/:jobId/status
```
- **Description**: Récupère le statut d'un job
- **Authentification**: Requise
- **Permissions**: `tickets.jobs.read`
- **Response**:
```json
{
  "success": true,
  "message": "Job status retrieved successfully",
  "data": {
    "id": "job_1643123456789",
    "status": "completed",
    "progress": {
      "total": 100,
      "completed": 100,
      "failed": 0,
      "percentage": 100
    },
    "startedAt": "2024-01-25T15:25:00.000Z",
    "completedAt": "2024-01-25T15:30:00.000Z",
    "results": {
      "ticketsGenerated": 100,
      "qrCodesGenerated": 100,
      "pdfsGenerated": 100
    }
  }
}
```

### Cancel Job
```
DELETE /api/tickets/job/:jobId/cancel
```
- **Description**: Annule un job
- **Authentification**: Requise
- **Permissions**: `tickets.jobs.cancel`
- **Response**:
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "data": {
    "id": "job_1643123456789",
    "status": "cancelled",
    "cancelledAt": "2024-01-25T15:30:00.000Z",
    "cancelledBy": "user-123"
  }
}
```

### List Jobs
```
GET /api/tickets/jobs
```
- **Description**: Lister les jobs
- **Authentification**: Requise
- **Permissions**: `tickets.jobs.read`
- **Query Parameters**:
- `page`: Numéro de page (défaut: 1)
- `limit`: Nombre par page (défaut: 20)
- `status`: Filtre par statut (pending, processing, completed, failed, cancelled)
- `eventId`: Filtre par événement
- `type`: Filtre par type de job
- **Response**:
```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "data": {
    "jobs": [
      {
        "id": "job_1643123456789",
        "type": "batch_generation",
        "status": "completed",
        "eventId": "EVENT-456",
        "createdAt": "2024-01-25T15:25:00.000Z",
        "completedAt": "2024-01-25T15:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "pages": 3
    }
  }
}
```

---

## 📊 **Statistics Routes**

### Get Event Tickets
```
GET /api/tickets/events/:eventId/tickets
```
- **Description**: Récupère les tickets d'un événement
- **Authentification**: Requise
- **Permissions**: `tickets.read`
- **Query Parameters**:
- `page`: Numéro de page (défaut: 1)
- `limit`: Nombre par page (défaut: 20)
- `status`: Filtre par statut
- `type`: Filtre par type de ticket
- **Response**:
```json
{
  "success": true,
  "message": "Event tickets retrieved successfully",
  "data": {
    "tickets": [
      {
        "id": "TICKET-123456",
        "eventId": "EVENT-456",
        "type": "standard",
        "status": "generated",
        "generatedAt": "2024-01-25T15:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 500,
      "pages": 25
    },
    "eventId": "EVENT-456"
  }
}
```

### Get Event Ticket Stats
```
GET /api/tickets/events/:eventId/stats
```
- **Description**: Statistiques de tickets d'un événement
- **Authentification**: Requise
- **Permissions**: `tickets.stats.read`
- **Response**:
```json
{
  "success": true,
  "message": "Event ticket statistics retrieved successfully",
  "data": {
    "eventId": "EVENT-456",
    "totalTickets": 500,
    "generatedTickets": 450,
    "pendingTickets": 30,
    "failedTickets": 20,
    "types": {
      "standard": 300,
      "vip": 150,
      "premium": 50
    },
    "generatedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Get Queue Stats
```
GET /api/tickets/queue/stats
```
- **Description**: Récupère les statistiques des queues
- **Authentification**: Requise
- **Permissions**: `tickets.stats.read`
- **Response**:
```json
{
  "success": true,
  "message": "Queue statistics retrieved successfully",
  "data": {
    "pendingJobs": 5,
    "processingJobs": 2,
    "completedJobs": 150,
    "failedJobs": 3,
    "averageProcessingTime": "2.5 minutes",
    "queueLength": 7,
    "throughput": {
      "jobsPerHour": 25,
      "ticketsPerHour": 500
    }
  }
}
```

---

## 📁 **Download Routes**

### Download Ticket
```
GET /api/tickets/:ticketId/download
```
- **Description**: Télécharge un ticket au format PDF
- **Authentification**: Requise
- **Permissions**: `tickets.read`
- **Response**: PDF file

### Download QR Code
```
GET /api/tickets/:ticketId/qrcode
```
- **Description**: Télécharge le QR code d'un ticket
- **Authentification**: Requise
- **Permissions**: `tickets.read`
- **Response**: PNG image

---

## 🧹 **Maintenance Routes**

### Clean Completed Jobs
```
POST /api/tickets/queue/clean
```
- **Description**: Nettoie les jobs terminés
- **Authentification**: Requise
- **Permissions**: `tickets.admin`
- **Request Body**:
```json
{
  "olderThan": "7d",
  "status": ["completed", "failed"]
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Jobs terminés nettoyés",
  "data": {
    "cleanedCount": 25,
    "cleanedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

---

## 📊 **Error Responses**

Toutes les erreurs suivent ce format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description de l'erreur",
    "details": [
      {
        "field": "eventId",
        "message": "Event ID is required"
      }
    ]
  }
}
```

### Codes d'erreur communs:
- `VALIDATION_ERROR`: Erreur de validation des données
- `TICKET_NOT_FOUND`: Ticket non trouvé
- `EVENT_NOT_FOUND`: Événement non trouvé
- `JOB_NOT_FOUND`: Job non trouvé
- `INSUFFICIENT_PERMISSIONS`: Permissions insuffisantes
- `QUOTA_EXCEEDED`: Quota dépassé
- `TEMPLATE_NOT_FOUND`: Template non trouvé
- `GENERATION_FAILED`: Échec de génération
- `QUEUE_FULL`: Queue pleine

---

## 🚀 **Rate Limiting**

- **Limite générale**: 100 requêtes par 15 minutes par IP
- **Limite génération**: 20 tickets par minute par IP
- **Limite batch**: 5 batch jobs par heure par IP
- **Limite PDF**: 10 PDFs par minute par IP

---

## 📝 **Notes**

- Tous les timestamps sont en format ISO 8601
- Les IDs sont sensibles à la casse
- Les jobs sont conservés 30 jours par défaut
- Les QR codes incluent une signature anti-fraude
- Les PDFs sont générés avec des templates personnalisables
- Le traitement batch est asynchrone

---

## 🔗 **Liens Utiles**

- [Documentation QR Code Service](../core/qrcode/)
- [Documentation PDF Service](../core/pdf/)
- [Documentation Batch Service](../core/database/)
- [Postman Collection](../postman/Ticket-Generator-Service.postman_collection.json)
