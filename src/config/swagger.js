'use strict';

const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

function loadSpec() {
  const specPath = path.join(__dirname, '../../../shared/docs/specs/ticket-generator-service.yaml');
  if (!fs.existsSync(specPath)) {
    console.warn('[Swagger] Spec non trouvée. Exécuter : cd shared/docs && npm run generate');
    return { openapi: '3.0.0', info: { title: 'Ticket Generator API', version: '1.0.0' }, paths: {} };
  }
  return yaml.load(fs.readFileSync(specPath, 'utf8'));
}

const specs = loadSpec();

const swaggerUiOptions = {
  explorer: false,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    filter: true,
    docExpansion: 'none'
  },
  customCss: '.swagger-ui .topbar { display: none; }',
  customSiteTitle: 'Ticket Generator API — Event Planner'
};

module.exports = { specs, swaggerUi, swaggerUiOptions };
