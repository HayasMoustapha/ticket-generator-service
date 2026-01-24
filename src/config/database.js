const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuration de la base de données
const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'event_planner_ticket_generator',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
};

// Créer le pool de connexions
const database = new Pool(databaseConfig);

// Gestion des erreurs du pool
database.on('error', (err) => {
  logger.error('Database pool error:', {
    error: err.message,
    stack: err.stack
  });
});

// Test de connexion
database.connect()
  .then(client => {
    logger.info('Connected to PostgreSQL database', {
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database
    });
    client.release();
  })
  .catch(err => {
    logger.error('Failed to connect to database:', {
      error: err.message,
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database
    });
  });

module.exports = {
  database,
  databaseConfig
};
