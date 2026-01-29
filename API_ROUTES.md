# Ticket Generator Service API Routes Documentation

## Overview

This document provides a comprehensive overview of all available API routes in the Ticket Generator Service. The service runs on port **3004** and provides **technical ticket generation functionality** with QR code generation, PDF creation, batch processing, and job management.

**⚠️ IMPORTANT**: This is a **technical service only**. It handles file generation without business logic or user management. All business operations are delegated to `event-planner-core`.

## Base URL

```
http://localhost:3004/api
```

## Service Architecture

### Ticket Generator Service Responsibilities ✅
- **QR Code Generation**: Technical QR code creation
- **PDF Generation**: Technical PDF ticket creation
- **Batch Processing**: Queue-based batch generation
- **Job Management**: Generation job tracking and monitoring
- **File Storage**: Generated file management

### Delegated to Other Services 🔄
- **Ticket Validation**: `scan-validation-service` (port 3005)
- **Ticket Management**: `event-planner-core` (port 3001)
- **User Management**: `event-planner-auth` (port 3000)
- **Business Logic**: `event-planner-core` (port 3001)

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

**Note**: Only technical data required for QR generation. No user context needed.

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
- `POST /api/tickets/generate` - Generate a single ticket (technical)
- `POST /api/tickets/batch` - Generate tickets in batch (technical)
- `GET /api/tickets/:ticketId` - Get ticket details by ID (technical)
- `GET /api/tickets/event/:eventId` - Get tickets for an event (technical)
- `POST /api/tickets/:ticketId/regenerate` - Regenerate a ticket (technical)

**❌ DELEGATED OPERATIONS**
- **Ticket Validation**: See `scan-validation-service` (port 3005)
- **Ticket Deletion**: See `event-planner-core` (port 3001)

#### Request Body (Generate Single Ticket)
```json
{
  "ticketData": {
    "id": "ticket-1234567890abcdef",
    "eventId": "event-1234567890abcdef",
    "type": "standard",
    "attendeeName": "John Doe",
    "attendeeEmail": "john.doe@example.com"
  },
  "options": {
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

**Note**: Only technical data required for generation. No user context or business logic.

#### Request Body (Batch Generation)
```json
{
  "tickets": [
    {
      "id": "ticket-1234567890abcdef",
      "eventId": "event-1234567890abcdef",
      "type": "standard",
      "attendeeName": "John Doe",
      "attendeeEmail": "john.doe@example.com"
    },
    {
      "id": "ticket-1234567890abcdef2",
      "eventId": "event-1234567890abcdef",
      "type": "vip",
      "attendeeName": "Jane Smith",
      "attendeeEmail": "jane.smith@example.com"
    }
  ],
  "batchOptions": {
    "qrFormat": "base64",
    "qrSize": "medium",
    "pdfFormat": true
  }
}
```

**Note**: Technical batch processing without user context.

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
  "ticketData": {
    "id": "ticket-1234567890abcdef",
    "eventId": "event-1234567890abcdef",
    "attendeeName": "John Doe",
    "attendeeEmail": "john.doe@example.com"
  },
  "eventData": {
    "id": "event-1234567890abcdef",
    "name": "Tech Conference 2026",
    "date": "2026-03-15T09:00:00Z"
  },
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

**Note**: Technical PDF generation with display data only.

#### PDF Options
- `format` - Output format: base64, binary
- `includeQR` - Include QR code in PDF
- `includeLogo` - Include event logo
- `customFields` - Additional ticket fields

---

### 5. Queue Monitoring Module

#### Queue Operations
- `GET /api/queues/stats` - Get queue processing statistics
- `GET /api/queues/health` - Check queue service health

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
- `GET /api` - API information (no authentication required)

---

## 🎯 Service Communication

### Input Data (Technical Only)
- **Ticket Generation**: Technical ticket data + display options
- **QR Generation**: Technical QR parameters
- **PDF Generation**: Technical PDF parameters + display data
- **Batch Processing**: Array of technical data

### Output Data (Files + Status)
- **Generated Files**: QR codes, PDFs in requested format
- **Status Information**: Generation progress, job status
- **Technical Metadata**: File paths, generation timestamps

### No Business Logic
- ❌ No user authentication
- ❌ No permission checking  
- ❌ No business validation
- ❌ No user context storage

---

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

API endpoints may be rate limited for technical protection. Check response headers for rate limit information.

## Postman Collection

A complete Postman collection with all 12 routes is available in:
- `postman/ticket-generator-service.postman_collection.json`

## Environment Variables

Required environment variables are defined in:
- `postman/Ticket-Generator-Service.postman_environment.json`

---

**Last Updated:** January 29, 2026  
**Version:** 3.1.0  
**Total Routes:** 12 (reduced from 20 after refactoring)

## 🎯 Refactoring Summary

### Removed Routes (8 routes deleted)
- **Ticket Validation** (1 route): Delegated to `scan-validation-service`
- **Ticket Deletion** (1 route): Delegated to `event-planner-core`
- **Job Management** (4 routes): Simplified to direct generation
- **Statistics** (2 routes): Delegated to core business logic

### Architecture Benefits
- ✅ **Technical Only**: Pure file generation without business logic
- ✅ **No User Context**: Service works with technical data only
- ✅ **Clean Dependencies**: No authentication or authorization
- ✅ **Simplified API**: Direct generation without job complexity
- ✅ **Better Isolation**: Technical service with clear boundaries

### Service Communication
- **Input**: Technical generation data from `event-planner-core`
- **Output**: Generated files + status information
- **No Business Logic**: Pure technical execution
- **Stateless**: Each request independent
