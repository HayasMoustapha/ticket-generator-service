# 📁 ARBORESCENCE COMPLÈTE - TICKET GENERATOR SERVICE

## 🎯 Vue d'ensemble

Le **Ticket Generator Service** est le service spécialisé dans la génération de tickets sécurisés avec QR codes et PDF pour la plateforme Event Planner SaaS.

```
📁 ticket-generator-service/
├── 📁 src/                    # Code source principal
├── 📁 database/               # Gestion base de données
├── 📁 tests/                  # Tests automatisés
├── 📁 docs/                   # Documentation
├── 📁 postman/                # Collections API
├── 📁 logs/                   # Logs applicatifs
└── 📄 Configuration files     # Fichiers de config
```

---

## 📁 DÉTAIL DE L'ARBORESCENCE

### 📁 src/ - Code source principal

```
📁 src/
├── 📁 api/                    # API REST
│   ├── 📁 routes/             # Routes API
│   │   ├── 📄 tickets.routes.js
│   │   ├── 📄 batches.routes.js
│   │   ├── 📄 templates.routes.js
│   │   ├── 📄 qr-codes.routes.js
│   │   └── 📄 status.routes.js
│   │
│   └── 📁 controllers/        # Contrôleurs API
│       ├── 📄 tickets.controller.js
│       ├── 📄 batches.controller.js
│       ├── 📄 templates.controller.js
│       ├── 📄 qr-codes.controller.js
│       └── 📄 status.controller.js
│
├── 📁 core/                   # Cœur métier
│   ├── 📁 services/           # Services métier
│   │   ├── 📄 ticket.service.js
│   │   ├── 📄 batch.service.js
│   │   ├── 📄 template.service.js
│   │   ├── 📄 qr-code.service.js
│   │   └── 📄 pdf.service.js
│   │
│   ├── 📁 generators/         # Générateurs
│   │   ├── 📄 qr-generator.js
│   │   ├── 📄 pdf-generator.js
│   │   ├── 📄 barcode-generator.js
│   │   └── 📄 code-generator.js
│   │
│   └── 📁 processors/         # Processeurs
│       ├── 📄 ticket.processor.js
│       ├── 📄 batch.processor.js
│       ├── 📄 template.processor.js
│       └── 📄 qr-processor.js
│
├── 📁 services/              # Services partagés
│   ├── 📄 database.service.js
│   ├── 📄 redis.service.js
│   ├── 📄 queue.service.js
│   ├── 📄 storage.service.js
│   └── 📄 metrics.service.js
│
├── 📁 database/              # Base de données
│   ├── 📁 bootstrap/          # Scripts bootstrap
│   │   ├── 📄 001_create_schema_migrations.sql
│   │   └── 📄 002_create_database.sql
│   │
│   ├── 📁 migrations/         # Migrations SQL
│   │   ├── 📄 001_initial_schema.sql
│   │   ├── 📄 002_add_indexes.sql
│   │   └── 📄 003_add_templates.sql
│   │
│   └── 📄 connection.js       # Connexion BDD
│
├── 📁 middleware/            # Middlewares
│   ├── 📄 validation.middleware.js
│   ├── 📄 rate-limit.middleware.js
│   ├── 📄 auth.middleware.js
│   └── 📄 error.middleware.js
│
├── 📁 config/                # Configuration
│   ├── 📄 database.js
│   ├── 📄 redis.js
│   ├── 📄 qr-codes.js
│   ├── 📄 pdf.js
│   ├── 📄 templates.js
│   └── 📄 storage.js
│
├── 📁 utils/                 # Utilitaires
│   ├── 📄 logger.js
│   ├── 📄 helpers.js
│   ├── 📄 validators.js
│   └── 📄 constants.js
│
├── 📁 error/                 # Gestion erreurs
│   ├── 📄 error-handler.js
│   ├── 📄 custom-errors.js
│   └── 📄 error-types.js
│
├── 📁 health/                # Health checks
│   ├── 📄 health.controller.js
│   ├── 📄 health.routes.js
│   └── 📄 health.service.js
│
├── 📁 workers/               # Workers async
│   ├── 📄 ticket.worker.js
│   ├── 📄 batch.worker.js
│   └── 📄 cleanup.worker.js
│
├── 📄 server.js              # Serveur principal
├── 📄 bootstrap.js           # Initialisation
└── 📄 index.js               # Export principal
```

### 📁 database/ - Gestion base de données

```
📁 database/
├── 📁 bootstrap/              # Scripts bootstrap
│   ├── 📄 001_create_schema_migrations.sql
│   ├── 📄 002_create_database.sql
│   └── 📄 003_create_extensions.sql
│
├── 📁 migrations/             # Migrations SQL
│   ├── 📄 001_initial_schema.sql
│   ├── 📄 002_add_indexes.sql
│   ├── 📄 003_add_templates.sql
│   ├── 📄 004_add_audit_tables.sql
│   └── 📄 005_add_statistics.sql
│
├── 📁 schema/                 # Documentation schéma
│   ├── 📄 generated_tickets.sql
│   ├── 📄 ticket_generation_logs.sql
│   ├── 📄 ticket_templates.sql
│   └── 📄 ticket_batches.sql
│
├── 📁 seeds/                  # Données initiales
│   ├── 📄 001_default_templates.sql
│   ├── 📄 002_sample_tickets.sql
│   └── 📄 003_test_batches.sql
│
├── 📄 DATABASE_BOOTSTRAP.md   # Documentation BDD
├── 📄 README.md               # README database
└── 📄 connection.js           # Configuration connexion
```

### 📁 tests/ - Tests automatisés

```
📁 tests/
├── 📁 unit/                   # Tests unitaires
│   ├── 📁 services/
│   │   ├── 📄 ticket.service.test.js
│   │   ├── 📄 batch.service.test.js
│   │   ├── 📄 template.service.test.js
│   │   └── 📄 qr-code.service.test.js
│   ├── 📁 generators/
│   │   ├── 📄 qr-generator.test.js
│   │   ├── 📄 pdf-generator.test.js
│   │   └── 📄 barcode-generator.test.js
│   └── 📁 utils/
│       ├── 📄 logger.test.js
│       └── 📄 helpers.test.js
│
├── 📁 integration/            # Tests d'intégration
│   ├── 📄 ticket.integration.test.js
│   ├── 📄 batch.integration.test.js
│   ├── 📄 template.integration.test.js
│   └── 📄 qr-code.integration.test.js
│
├── 📁 e2e/                    # Tests end-to-end
│   ├── 📄 ticket-generation.e2e.test.js
│   ├── 📄 batch-processing.e2e.test.js
│   ├── 📄 template-rendering.e2e.test.js
│   └── 📄 qr-code-scanning.e2e.test.js
│
├── 📁 fixtures/               # Données de test
│   ├── 📄 tickets.json
│   ├── 📄 batches.json
│   ├── 📄 templates.json
│   └── 📄 qr-codes.json
│
├── 📁 helpers/                # Helpers de test
│   ├── 📄 database.helper.js
│   ├── 📄 qr-helper.js
│   └── 📄 mock.helper.js
│
├── 📄 setup.js                # Configuration tests
├── 📄 teardown.js             # Nettoyage tests
└── 📄 test.config.js          # Config tests
```

### 📁 docs/ - Documentation

```
📁 docs/
├── 📄 README.md               # Documentation principale
├── 📄 API_ROUTES.md           # Routes API
├── 📄 QR_CODES.md             # Génération QR codes
├── 📄 TEMPLATES.md            # Gestion templates
├── 📄 BATCH_PROCESSING.md     # Traitement par lot
├── 📄 DEPLOYMENT.md           # Guide déploiement
└── 📄 TROUBLESHOOTING.md      # Dépannage
```

### 📁 postman/ - Collections API

```
📁 postman/
├── 📄 Ticket-Generator-Service.postman_collection.json
├── 📄 Ticket-Generator-Service.postman_environment.json
├── 📄 ticket-generator-service.postman_collection.json.backup
└── 📁 examples/
    ├── 📄 generate-ticket.json
    ├── 📄 create-batch.json
    ├── 📄 create-template.json
    └── 📄 generate-qr-code.json
```

---

## 📄 Fichiers de configuration

### 📄 Fichiers principaux

```
📄 package.json              # Dépendances et scripts
📄 package-lock.json          # Lock versions
📄 .env.example              # Variables environnement
📄 .gitignore                # Fichiers ignorés Git
📄 Dockerfile                # Configuration Docker
├── 📄 README.md               # README principal
├── 📄 API_ROUTES.md           # Documentation routes API
└── 📄 Dockerfile                # Configuration Docker
```

---

## 🎯 Rôle de chaque dossier

### 📁 src/ - Code métier
Contient toute la logique applicative organisée en couches pour une meilleure maintenabilité.

### 📁 database/ - Persistance
Gère tout ce qui concerne la base de données : schéma, migrations, seeds et connexions.

### 📁 tests/ - Qualité
Assure la qualité du code avec des tests unitaires, d'intégration et end-to-end.

### 📁 docs/ - Documentation
Centralise toute la documentation technique et utilisateur.

### 📁 postman/ - API Testing
Facilite les tests manuels et l'exploration des API avec des collections Postman.

### 📁 logs/ - Logging
Centralise tous les logs applicatifs pour le debugging et le monitoring.

---

## 🚀 Points d'entrée principaux

### 📄 server.js
Point d'entrée principal du serveur Express. Configure et démarre l'application.

### 📄 bootstrap.js
Script d'initialisation : connexion BDD, migrations, démarrage services.

### 📄 index.js
Export principal pour les tests et l'utilisation comme module.

---

## 🔧 Configuration

### Variables d'environnement clés
- `NODE_ENV` : Environnement (development/production)
- `PORT` : Port d'écoute (3004)
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` : BDD
- `REDIS_URL` : Redis
- `UPLOAD_PATH` : Chemin uploads tickets
- `MAX_FILE_SIZE` : Taille max fichiers
- `TEMPLATES_PATH` : Chemin templates

### Scripts npm principaux
- `npm start` : Démarrage production
- `npm run dev` : Développement avec nodemon
- `npm test` : Tests unitaires
- `npm run test:integration` : Tests intégration
- `npm run test:e2e` : Tests E2E
- `npm run build` : Build production
- `npm run migrate` : Migrations BDD
- `npm run seed` : Seeding BDD

---

## 🔄 Génération de tickets

### 1. Génération individuelle
```
Core Service → Ticket Generator → QR Code → PDF → Stockage → Notification
```

### 2. Génération par lot
```
Core Service → Queue → Workers → QR Codes → PDFs → Stockage → Notification
```

### 3. Templates
```
Template Handlebars → Données → HTML → PDF → Stockage
```

---

## 🎨 Templates

### Structure des templates
```
📁 templates/
├── 📁 tickets/
│   ├── 📄 default.html
│   ├── 📄 vip.html
│   ├── 📄 standard.html
│   └── 📄 custom.html
├── 📁 components/
│   ├── 📄 header.html
│   ├── 📄 footer.html
│   ├── 📄 qr-code.html
│   └── 📄 styles.css
└── 📁 layouts/
    ├── 📄 portrait.html
    ├── 📄 landscape.html
    └── 📄 mobile.html
```

### Variables de template
```
{{eventName}}        # Nom de l'événement
{{eventDate}}        # Date de l'événement
{{location}}         # Lieu de l'événement
{{firstName}}        # Prénom de l'invité
{{lastName}}         # Nom de l'invité
{{email}}            # Email de l'invité
{{ticketType}}       # Type de ticket
{{ticketCode}}       # Code du ticket
{{qrCodeUrl}}        # URL du QR code
{{generatedAt}}      # Date de génération
{{seatNumber}}       # Numéro de place (optionnel)
{{tableNumber}}      # Numéro de table (optionnel)
```

---

## 🔒 Sécurité

### QR Codes sécurisés
- **Signature HMAC** : Protection contre la falsification
- **Timestamp** : Protection contre la réutilisation
- **Unique IDs** : Unicité garantie
- **Checksum** : Validation d'intégrité

### Format du QR code
```
{
  "ticketId": "TC-2024-123456",
  "eventId": 456,
  "guestId": 123,
  "signature": "sha256-hash",
  "timestamp": "2024-01-01T12:00:00Z",
  "checksum": "crc32"
}
```

### Validation
- Vérification de la signature
- Validation du timestamp
- Contrôle de l'unicité
- Vérification du checksum

---

## 📊 Performance

### Génération par lot
- **Queue processing** : Traitement asynchrone
- **Worker pools** : Parallélisation
- **Batch size** : Configurable
- **Retry logic** : Gestion des erreurs

### Optimisations
- **Template caching** : Cache des templates
- **PDF streaming** : Génération streaming
- **Image optimization** : Compression images
- **CDN integration** : Distribution rapide

---

## 📱 Formats supportés

### QR Codes
- **PNG** : Haute qualité
- **SVG** : Vectoriel
- **Base64** : Intégration web
- **Print-ready** : Impression

### PDFs
- **A4** : Standard
- **A5** : Compact
- **Mobile** : Optimisé mobile
- **Print** : Haute résolution

---

**Version** : 1.0.0  
**Dernière mise à jour** : 29 janvier 2026
