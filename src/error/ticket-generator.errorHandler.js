const { ErrorHandlerFactory } = require('../../../shared');

/**
 * Error Handler personnalisé pour Ticket Generator Service
 * Gère les erreurs spécifiques à la génération de tickets, QR codes, PDF et templates
 */

const ticketGeneratorErrorHandler = ErrorHandlerFactory.create('Ticket Generator Service', {
  logLevel: 'error',
  includeStackTrace: process.env.NODE_ENV === 'development',
  customErrorTypes: {
    // Erreurs de génération de tickets
    'TicketGenerationError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    'InvalidTicketData': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'TicketNotFound': {
      category: 'not_found',
      statusCode: 404,
      severity: 'medium',
      retryable: false
    },
    'TicketAlreadyGenerated': {
      category: 'business',
      statusCode: 409,
      severity: 'medium',
      retryable: false
    },
    'TicketExpired': {
      category: 'business',
      statusCode: 410,
      severity: 'medium',
      retryable: false
    },
    'InvalidTicketType': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    
    // Erreurs de QR code
    'QRCodeGenerationError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    'InvalidQRData': {
      category: 'validation',
      statusCode: 400,
      severity: 'low',
      retryable: false
    },
    'QRCodeCorrupted': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: false
    },
    'QRCodeSizeError': {
      category: 'validation',
      statusCode: 400,
      severity: 'low',
      retryable: false
    },
    'QRCodeFormatError': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'QRCodeTampered': {
      category: 'security',
      statusCode: 401,
      severity: 'high',
      retryable: false
    },
    
    // Erreurs de génération PDF
    'PDFGenerationError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    'PDFCorrupted': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: false
    },
    'PDFSizeError': {
      category: 'technical',
      statusCode: 500,
      severity: 'medium',
      retryable: false
    },
    'PDFFormatError': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'PDFTemplateError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    'PDFRenderingError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    
    // Erreurs de templates
    'TemplateNotFoundError': {
      category: 'not_found',
      statusCode: 404,
      severity: 'medium',
      retryable: false
    },
    'TemplateInvalidError': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'TemplateCorrupted': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: false
    },
    'TemplateMissingFields': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'TemplateSyntaxError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: false
    },
    
    // Erreurs de génération batch
    'BatchGenerationError': {
      category: 'technical',
      statusCode: 500,
      severity: 'high',
      retryable: true
    },
    'BatchSizeExceeded': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    'BatchTimeout': {
      category: 'technical',
      statusCode: 408,
      severity: 'high',
      retryable: true
    },
    'BatchPartialFailure': {
      category: 'technical',
      statusCode: 207,
      severity: 'medium',
      retryable: false
    },
    'BatchInvalidData': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    
    // Erreurs de base de données
    'DatabaseConnectionError': {
      category: 'technical',
      statusCode: 503,
      severity: 'high',
      retryable: true
    },
    'DatabaseQueryError': {
      category: 'technical',
      statusCode: 500,
      severity: 'medium',
      retryable: true
    },
    'DatabaseConstraintError': {
      category: 'validation',
      statusCode: 400,
      severity: 'medium',
      retryable: false
    },
    
    // Erreurs techniques communes
    'ExternalServiceError': {
      category: 'technical',
      statusCode: 502,
      severity: 'medium',
      retryable: true
    },
    'ConfigurationError': {
      category: 'technical',
      statusCode: 500,
      severity: 'medium',
      retryable: false
    },
    'TimeoutError': {
      category: 'technical',
      statusCode: 408,
      severity: 'medium',
      retryable: true
    },
    'RateLimitError': {
      category: 'security',
      statusCode: 429,
      severity: 'medium',
      retryable: false
    },
    'InsufficientResources': {
      category: 'technical',
      statusCode: 503,
      severity: 'high',
      retryable: true
    }
  }
});

module.exports = ticketGeneratorErrorHandler;
