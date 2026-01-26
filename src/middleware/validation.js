const Joi = require('joi');
const { validationErrorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware de validation avec Joi
 */

/**
 * Schémas de validation pour les différentes requêtes
 */
const schemas = {
  // Validation pour la génération d'un ticket
  generateTicket: Joi.object({
    ticketData: Joi.object({
      id: Joi.string().required().messages({
        'any.required': 'L\'ID du ticket est requis'
      }),
      eventId: Joi.string().required().messages({
        'any.required': 'L\'ID de l\'événement est requis'
      }),
      // userId sera injecté par le middleware depuis le contexte
      type: Joi.string().optional().valid('standard', 'vip', 'premium', 'early-bird').messages({
        'any.only': 'Le type de ticket doit être l\'un des suivants: standard, vip, premium, early-bird'
      }),
      price: Joi.number().integer().min(0).optional().messages({
        'number.base': 'Le prix doit être un nombre',
        'number.integer': 'Le prix doit être un entier',
        'number.min': 'Le prix ne peut être négatif'
      }),
      createdAt: Joi.date().optional().iso().messages({
        'date.format': 'La date de création doit être au format ISO'
      })
    }).required().messages({
      'any.required': 'Les données du ticket sont requises'
    }),
    options: Joi.object({
      qrOptions: Joi.object({
        width: Joi.number().integer().min(50).max(500).optional().messages({
          'number.min': 'La largeur du QR code doit être entre 50 et 500',
          'number.max': 'La largeur du QR code doit être entre 50 et 500'
        }),
        margin: Joi.number().integer().min(0).max(5).optional().messages({
          'number.min': 'La marge du QR code doit être entre 0 et 5',
          'number.max': 'La marge du QR code doit être entre 0 et 5'
        }),
        color: Joi.object({
          dark: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
            'string.pattern.base': 'La couleur sombre doit être au format hexadécimal (#RRGGBB)'
          }),
          light: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
            'string.pattern.base': 'La couleur claire doit être au format hexadécimal (#RRGGBB)'
          })
        }).optional()
      }).optional()
    }).optional()
  }).unknown(false),

  // Validation pour la génération en lot
  generateBatch: Joi.object({
    tickets: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        eventId: Joi.string().required(),
        // userId sera injecté par le middleware depuis le contexte
        type: Joi.string().optional().valid('standard', 'vip', 'premium', 'early-bird'),
        price: Joi.number().integer().min(0).optional(),
        createdAt: Joi.date().optional().iso()
      })
    ).min(1).max(1000).required().messages({
      'array.min': 'Au moins un ticket est requis',
      'array.max': 'Maximum 1000 tickets par lot',
      'any.required': 'La liste des tickets est requise'
    }),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high', 'critical').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high, critical'
      }),
      delay: Joi.number().integer().min(0).max(3600).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 3600 secondes'
      }),
      attempts: Joi.number().integer().min(1).max(10).optional().messages({
        'number.min': 'Le nombre de tentatives doit être au moins 1',
        'number.max': 'Le nombre de tentatives ne peut dépasser 10'
      }),
      qrOptions: Joi.object({
        width: Joi.number().integer().min(50).max(500).optional(),
        margin: Joi.number().integer().min(0).max(5).optional(),
        color: Joi.object({
          dark: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
          light: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
        }).optional()
      }).optional()
    }).optional()
  }).unknown(false),

  // Validation pour la génération PDF
  generatePDF: Joi.object({
    ticketData: Joi.object({
      id: Joi.string().required(),
      eventId: Joi.string().required(),
      // userId sera injecté par le middleware depuis le contexte
      type: Joi.string().optional(),
      price: Joi.number().integer().min(0).optional(),
      status: Joi.string().optional().valid('active', 'used', 'expired', 'cancelled', 'pending'),
      createdAt: Joi.date().optional().iso()
    }).required(),
    eventData: Joi.object({
      id: Joi.string().required(),
      title: Joi.string().min(1).max(200).required().messages({
        'string.min': 'Le titre de l\'événement est requis',
        'string.max': 'Le titre de l\'événement ne peut dépasser 200 caractères'
      }),
      eventDate: Joi.date().iso().required().messages({
        'any.required': 'La date de l\'événement est requise',
        'date.format': 'La date de l\'événement doit être au format ISO'
      }),
      location: Joi.string().max(200).optional().messages({
        'string.max': 'Le lieu ne peut dépasser 200 caractères'
      }),
      description: Joi.string().max(1000).optional().messages({
        'string.max': 'La description ne peut dépasser 1000 caractères'
      })
    }).required(),
    userData: Joi.object({
      first_name: Joi.string().min(1).max(50).required().messages({
        'string.min': 'Le prénom est requis',
        'string.max': 'Le prénom ne peut dépasser 50 caractères'
      }),
      last_name: Joi.string().min(1).max(50).required().messages({
        'string.min': 'Le nom est requis',
        'string.max': 'Le nom ne peut dépasser 50 caractères'
      }),
      email: Joi.string().email().required().messages({
        'string.email': 'L\'email doit être valide'
      }),
      phone: Joi.string().pattern(/^\+?[0-9\s\-\(\)]+$/).optional().messages({
        'string.pattern.base': 'Le numéro de téléphone n\'est pas valide'
      })
    }).required(),
    options: Joi.object({
      pdfOptions: Joi.object({
        size: Joi.string().valid('A4', 'A3', 'Letter').optional(),
        margins: Joi.object({
          top: Joi.number().integer().min(0).optional(),
          bottom: Joi.number().integer().min(0).optional(),
          left: Joi.number().integer().min(0).optional(),
          right: Joi.number().integer().min(0).optional()
        }).optional(),
        fontSize: Joi.number().integer().min(8).max(24).optional().messages({
          'number.min': 'La taille de police doit être entre 8 et 24',
          'number.max': 'La taille de police doit être entre 8 et 24'
        })
      }).optional()
    }).optional()
  }).unknown(false),

  // Validation pour la génération PDF en lot
  generateBatchPDF: Joi.object({
    tickets: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        eventId: Joi.string().required(),
        // userId sera injecté par le middleware depuis le contexte
        type: Joi.string().optional(),
        price: Joi.number().integer().min(0).optional(),
        status: Joi.string().optional().valid('active', 'used', 'expired', 'cancelled', 'pending')
      })
    ).min(1).max(500).required().messages({
      'array.min': 'Au moins un ticket est requis',
      'array.max': 'Maximum 500 tickets par lot PDF',
      'any.required': 'La liste des tickets est requise'
    }),
    eventData: Joi.object({
      id: Joi.string().required(),
      title: Joi.string().min(1).max(200).required(),
      eventDate: Joi.date().iso().required(),
      location: Joi.string().max(200).optional(),
      description: Joi.string().max(1000).optional()
    }).required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high', 'critical').optional(),
      delay: Joi.number().integer().min(0).max(3600).optional(),
      attempts: Joi.number().integer().min(1).max(10).optional(),
      pdfOptions: Joi.object({
        size: Joi.string().valid('A4', 'A3', 'Letter').optional(),
        margins: Joi.object({
          top: Joi.number().integer().min(0).optional(),
          bottom: Joi.number().integer().min(0).optional(),
          left: Joi.number().integer().min(0).optional(),
          right: Joi.number().integer().min(0).optional()
        }).optional(),
        fontSize: Joi.number().integer().min(8).max(24).optional()
      }).optional()
    }).optional()
  }).unknown(false),

  // Validation pour le traitement batch complet
  generateFullBatch: Joi.object({
    tickets: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        eventId: Joi.string().required(),
        // userId sera injecté par le middleware depuis le contexte
        type: Joi.string().optional(),
        price: Joi.number().integer().min(0).optional(),
        status: Joi.string().optional().valid('active', 'used', 'expired', 'cancelled', 'pending')
      })
    ).min(1).max(500).required().messages({
      'array.min': 'Au moins un ticket est requis',
      'array.max': 'Maximum 500 tickets par lot complet',
      'any.required': 'La liste des tickets est requise'
    }),
    eventData: Joi.object({
      id: Joi.string().required(),
      title: Joi.string().min(1).max(200).required(),
      eventDate: Joi.date().iso().required(),
      location: Joi.string().max(200).optional(),
      description: Joi.string().max(1000).optional()
    }).required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high', 'critical').optional(),
      delay: Joi.number().integer().min(0).max(3600).optional(),
      attempts: Joi.number().integer().min(1).max(10).optional(),
      qrOptions: Joi.object({
        width: Joi.number().integer().min(50).max(500).optional(),
        margin: Joi.number().integer().min(0).max(5).optional(),
        color: Joi.object({
          dark: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
          light: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
        }).optional()
      }).optional(),
      pdfOptions: Joi.object({
        size: Joi.string().valid('A4', 'A3', 'Letter').optional(),
        margins: Joi.object({
          top: Joi.number().integer().min(0).optional(),
          bottom: Joi.number().integer().min(0).optional(),
          left: Joi.number().integer().min(0).optional(),
          right: Joi.number().integer().min(0).optional()
        }).optional(),
        fontSize: Joi.number().integer().min(8).max(24).optional()
      }).optional()
    }).optional()
  }).unknown(false)
};

/**
 * Middleware de validation
 * @param {Object} schema - Schéma Joi de validation
 * @param {string} source - Source des données ('body', 'params', 'query')
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    
    // Permettre les champs injectés par le contexte
    const options = {
      abortEarly: false,
      allowUnknown: true, // Permettre les champs injectés par le contexte
      stripUnknown: false // Ne pas supprimer les champs injectés
    };

    const { error, value } = schema.validate(data, options);

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.validation('Validation failed', {
        source,
        errors,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json(
        validationErrorResponse(errors)
      );
    }

    // Fusionner les données validées avec les données existantes
    req[source] = { ...req[source], ...value };
    
    logger.validation('Validation passed', {
      source,
      fields: Object.keys(value),
      ip: req.ip
    });

    next();
  };
}

module.exports = {
  validate,
  schemas
};
