const DatabaseBootstrap = require('./services/database-bootstrap.service');

/**
 * Point d'entrée pour le bootstrap de l'application
 * Initialise les services critiques avant démarrage du serveur
 */
class ApplicationBootstrap {
  /**
   * Initialise tous les composants critiques de l'application
   * @throws {Error} Si l'initialisation échoue
   */
  async initialize() {
    console.log('🚀 Starting Service bootstrap...');
    
    try {
      // 0. Créer la base de données si elle n'existe pas (AVANT toute connexion)
      console.log('🔍 Checking database existence...');
      await DatabaseBootstrap.ensureDatabaseExists();
      console.log('✅ Database existence verified');
      
      // 1. Bootstrap de la base de données
      console.log('📊 Initializing database...');
      await DatabaseBootstrap.initialize();
      console.log('✅ Database initialized successfully');

      console.log('🎯 Application bootstrap completed successfully');
      
    } catch (error) {
      console.error('❌ Application bootstrap failed:', error.message);
      console.error('🔥 Server cannot start - critical services unavailable');
      process.exit(1); // Arrêt immédiat si bootstrap échoue
    }
  }
}

module.exports = new ApplicationBootstrap();
