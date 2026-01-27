# Ticket Generator Service API Routes Documentation

## Overview

This document provides a comprehensive overview of all available API routes in the Ticket Generator Service. The service runs on port **3004** and provides complete ticket generation functionality with QR code generation, PDF creation, batch processing, job management, and statistics tracking.

## Base URL

```
http://localhost:3004/api
```

## Authentication

All routes (except health endpoints) require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Modules

### 1. QR Code Generation Module

#### QR Code Operations
- `POST /api/tickets/qr/generate` - Generate QR code for a ticket
- `GET /api/tickets/:ticketId/qr` - Get QR code for a specific ticket

#### Request Body (Generate QR Code)
```json
{
  "ticketCode": "TICKET_123456",
  "ticketId": "ticket-1234567890abcdef",
  "eventId": "event-1234567890abcdef",
  "format": "base64",
  "size": "medium"
}
```

#### QR Code Formats
- `base64` - Base64 encoded image data
- `svg` - SVG vector format
- `png` - PNG image data
- `jpg` - JPEG image data

#### QR Code Sizes
- `small` - 128x128 pixels
- `medium` - 256x256 pixels
- `large` - 512x512 pixels

---

### 2. Ticket Generation Module

#### Ticket Operations
- `POST /api/tickets/generate` - Generate a single ticket
- `POST /api/tickets/batch` - Generate tickets in batch
- `POST /api/tickets/validate` - Validate a ticket
- `GET /api/tickets/:ticketId` - Get ticket details by ID
- `GET /api/tickets/event/:eventId` - Get tickets for an event
- `POST /api/tickets/:ticketId/regenerate` - Regenerate a ticket
- `DELETE /api/tickets/:ticketId` - Delete a ticket

#### Request Body (Generate Single Ticket)
```json
{
  "eventId": "event-1234567890abcdef",
  "ticketType": "standard",
  "attendeeInfo": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+33612345678",
    "address": {
      "street": "123 Main St",
      "city": "Paris",
      "country": "France",
      "postalCode": "75001"
    }
  },
  "ticketOptions": {
    "qrFormat": "base64",
    "qrSize": "medium",
    "pdfFormat": true,
    "includeLogo": false,
    "customFields": {
      "seatNumber": "A12",
      "gate": "Main Entrance"
    }
  }
}
```

#### Request Body (Batch Generation)
```json
{
  "eventId": "event-1234567890abcdef",
  "tickets": [
    {
      "ticketType": "standard",
      "attendeeInfo": {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+33612345678"
      }
    },
    {
      "ticketType": "vip",
      "attendeeInfo": {
        "name": "Jane Smith",
        "email": "jane.smith@example.com",
        "phone": "+33698765432"
      }
    }
  ],
  "ticketOptions": {
    "qrFormat": "base64",
    "qrSize": "medium",
    "pdfFormat": true
  }
}
```

#### Query Parameters (Get Event Tickets)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `status` - Filter by ticket status (optional)

---

### 3. PDF Generation Module

#### PDF Operations
- `POST /api/tickets/pdf` - Generate PDF for a ticket
- `POST /api/tickets/batch-pdf` - Generate PDFs in batch
- `GET /api/tickets/:ticketId/pdf` - Get PDF for a specific ticket

#### Request Body (Generate PDF)
```json
{
  "ticketId": "ticket-1234567890abcdef",
  "templateId": "template-1234567890abcdef",
  "options": {
    "format": "base64",
    "includeQR": true,
    "includeLogo": false,
    "customFields": {
      "seatNumber": "A12",
      "gate": "Main Entrance"
    }
  }
}
```

#### PDF Options
- `format` - Output format: base64, binary
- `includeQR` - Include QR code in PDF
- `includeLogo` - Include event logo
- `customFields` - Additional ticket fields

---

### 4. Job Management Module

#### Job Operations
- `POST /api/tickets/jobs` - Create a ticket generation job
- `GET /api/tickets/job/:jobId/status` - Get job status
- `POST /api/tickets/jobs/:jobId/process` - Process a specific job
- `DELETE /api/tickets/job/:jobId/cancel` - Cancel a job
- `GET /api/tickets/jobs` - List jobs with filters

#### Request Body (Create Job)
```json
{
  "jobType": "batch_generation",
  "parameters": {
    "eventId": "event-1234567890abcdef",
    "ticketCount": 100,
    "ticketType": "standard"
  },
  "priority": "normal"
}
```

#### Job Types
- `batch_generation` - Generate multiple tickets
- `pdf_generation` - Generate PDFs for existing tickets
- `qr_regeneration` - Regenerate QR codes
- `template_migration` - Apply new template to tickets

#### Job Status Values
- `pending` - Job queued but not started
- `processing` - Job currently running
- `completed` - Job finished successfully
- `failed` - Job failed with errors
- `cancelled` - Job was cancelled

#### Query Parameters (List Jobs)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `status` - Filter by job status
- `jobType` - Filter by job type

---

### 5. Statistics & Monitoring Module

#### Statistics Operations
- `GET /api/tickets/queue/stats` - Get queue processing statistics
- `GET /api/tickets/events/:eventId/stats` - Get ticket statistics for an event

#### Queue Statistics Response
```json
{
  "success": true,
  "data": {
    "pendingJobs": 5,
    "processingJobs": 2,
    "completedJobs": 150,
    "failedJobs": 1,
    "averageProcessingTime": 2.5,
    "queueLength": 7
  }
}
```

#### Event Statistics Response
```json
{
  "success": true,
  "data": {
    "totalTickets": 500,
    "generatedTickets": 450,
    "pendingTickets": 50,
    "standardTickets": 400,
    "vipTickets": 50,
    "pdfGenerated": 450,
    "qrGenerated": 450
  }
}
```

---

### 6. Health & Monitoring Module

#### Health Operations
- `GET /health` - Basic health check (no authentication required)
- `GET /api/tickets` - Get API information (no authentication required)

---

## Ticket Generation Flow

### Single Ticket Generation
1. `POST /api/tickets/generate` - Generate ticket with QR code
2. `POST /api/tickets/pdf` - Generate PDF (optional)
3. `GET /api/tickets/:ticketId` - Get ticket details

### Batch Ticket Generation
1. `POST /api/tickets/jobs` - Create batch job
2. `GET /api/tickets/job/:jobId/status` - Monitor progress
3. `GET /api/tickets/event/:eventId` - Get generated tickets

### Ticket Regeneration
1. `POST /api/tickets/:ticketId/regenerate` - Regenerate with new options
2. `GET /api/tickets/:ticketId/qr` - Get new QR code
3. `GET /api/tickets/:ticketId/pdf` - Get new PDF

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
```

## Success Responses

Most endpoints return consistent success responses:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

## Rate Limiting

API endpoints may be rate limited. Check response headers for rate limit information.

## Permissions

All endpoints require specific permissions. Permission format: `module.action` (e.g., `tickets.create`, `tickets.jobs.read`).

## Webhooks

The service supports webhooks for:
- Job completion notifications
- Batch generation progress updates
- Error notifications for failed jobs

Configure webhooks in the service configuration.

## Postman Collection

A complete Postman collection with all 20 routes is available in:
- `postman/ticket-generator-service.postman_collection.json`

## Environment Variables

Required environment variables are defined in:
- `postman/Ticket-Generator-Service.postman_environment.json`

---

**Last Updated:** January 27, 2026  
**Version:** 3.0.0  
**Total Routes:** 20
