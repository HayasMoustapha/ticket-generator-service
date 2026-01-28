# 🎫 Event Planner - Service Générateur de Billets

## 📋 Description

Le service Générateur de Billets crée et gère tous les billets de la plateforme Event Planner: QR codes sécurisés, PDF personnalisés, validation anti-fraude, et suivi en temps réel.

## 🏗️ Architecture Technique

```
┌─────────────────────────────────────────────────────────────┐
│            TICKET GENERATOR SERVICE (Port 3004)            │
├─────────────────────────────────────────────────────────────┤
│  📦 Modules Principaux:                                      │
│  ├── generators/     (QR codes, PDF)                        │
│  ├── validator/      (Validation billets)                   │
│  ├── templates/      (Designs billets)                       │
│  ├── security/       (Anti-fraude, watermark)               │
│  └── tracking/       (Suivi utilisation)                     │
│                                                             │
│  🔧 Technologies:                                            │
│  ├── Node.js + Express                                      │
│  ├── PostgreSQL (Historique billets)                         │
│  ├── QRCode (Génération QR codes)                           │
│  ├── PDFKit (Génération PDF)                                │
│  ├── Sharp (Traitement images)                              │
│  └── Crypto (Signatures numériques)                         │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Démarrage Rapide

### Installation
```bash
cd event-planner-backend/ticket-generator-service
npm install
cp .env.example .env
npm run db:up && npm run db:migrate
npm run dev
```

### Vérification
```bash
curl http://localhost:3004/health
# Retourne: {"status": "healthy", "service": "ticket-generator-service"}
```

## 📡 API Endpoints

### 🎫 Génération Billets
```http
POST /api/tickets/generate          (Générer billet)
GET  /api/tickets/:id               (Télécharger PDF)
GET  /api/tickets/:id/qr            (Générer QR code)
POST /api/tickets/batch             (Génération en lot)
```

### 🔍 Validation
```http
POST /api/tickets/validate          (Valider billet)
GET  /api/tickets/:id/status        (Statut billet)
POST /api/tickets/:id/checkin       (Check-in)
```

### 🎨 Templates
```http
GET  /api/templates/list            (Lister templates)
POST /api/templates/create          (Créer template)
PUT  /api/templates/:id             (Modifier template)
```

### 📊 Statistiques
```http
GET  /api/tickets/stats             (Statistiques générales)
GET  /api/tickets/event/:id/stats   (Stats par événement)
```

## 🔧 Configuration Essentielle

```bash
# Base de données
DATABASE_URL=postgresql://user:pass@localhost:5432/event_planner_tickets

# Authentification
SHARED_SERVICE_TOKEN=shared-service-token-abcdef12345678901234567890
AUTH_SERVICE_URL=http://localhost:3000

# Services externes
CORE_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_URL=http://localhost:3003

# Génération
QR_CODE_SIZE=300
PDF_QUALITY=high
TICKET_EXPIRY_HOURS=24

# Sécurité
TICKET_SECRET_KEY=votre-secret-billets
WATERMARK_TEXT=Event Planner
QR_ERROR_CORRECTION=M

# Stockage
TICKETS_STORAGE_PATH=./tickets
TEMP_PATH=./temp

# Serveur
PORT=3004
NODE_ENV=development
```

## 🎫 Flux de Génération

### 1. Création Billet
```mermaid
sequenceDiagram
    participant Client
    participant TicketAPI
    participant PaymentAPI
    participant QRGenerator
    participant PDFGenerator
    participant Database

    Client->>TicketAPI: POST /api/tickets/generate
    TicketAPI->>PaymentAPI: Vérifier paiement
    PaymentAPI-->>TicketAPI: Paiement confirmé
    TicketAPI->>QRGenerator: Générer QR code unique
    QRGenerator-->>TicketAPI: QR code sécurisé
    TicketAPI->>PDFGenerator: Générer PDF billet
    PDFGenerator-->>TicketAPI: PDF avec QR code
    TicketAPI->>Database: Sauvegarder billet
    TicketAPI-->>Client: Billet généré
```

### 2. Validation Billet
```mermaid
sequenceDiagram
    participant Scanner
    participant TicketAPI
    participant Database
    participant QRValidator

    Scanner->>TicketAPI: POST /api/tickets/validate + QR data
    TicketAPI->>QRValidator: Valider signature QR
    QRValidator-->>TicketAPI: QR valide
    TicketAPI->>Database: Vérifier statut billet
    Database-->>TicketAPI: Billet valide et non utilisé
    TicketAPI->>Database: Marquer comme utilisé
    TicketAPI-->>Scanner: Validation OK
```

## 🎨 Templates de Billets

### Types Disponibles
- `standard` - Billet standard avec QR code
- `vip` - Billet VIP avec design premium
- `early_bird` - Billet early bird spécial
- `group` - Billet groupe (noms multiples)
- `digital_only` - Billet numérique uniquement

### Personnalisation
```javascript
// Template personnalisé
{
  "name": "Mon Événement 2024",
  "background": "#ffffff",
  "primaryColor": "#2563eb",
  "logo": "https://example.com/logo.png",
  "watermark": true,
  "qrPosition": "bottom-right",
  "fields": ["name", "email", "ticket_type", "seat_number"]
}
```

## 📊 Base de Données

### Tables Principales
```sql
tickets          -- Billets générés
ticket_templates  -- Designs de billets
qr_codes         -- QR codes générés
validation_logs  -- Logs de validation
usage_tracking   -- Suivi utilisation
```

## 🧪 Tests Rapides

```bash
# Générer billet
curl -X POST http://localhost:3004/api/tickets/generate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 123,
    "userId": 456,
    "ticketType": "vip",
    "paymentId": "pay_xxxxxxxxxxxxxx"
  }'

# Valider billet
curl -X POST http://localhost:3004/api/tickets/validate \
  -H "Content-Type: application/json" \
  -d '{
    "qrData": "encrypted_qr_data_here",
    "eventId": 123
  }'
```

## 🔐 Sécurité Anti-Fraude

### QR Codes Sécurisés
- **Signature HMAC** avec secret unique
- **Timestamp** intégré pour expiration
- **Données cryptées** avec AES-256
- **Watermark** invisible sur PDF

### Validation Multiple
- **Vérification signature** QR code
- **Contrôle date/heure** événement
- **Statut paiement** confirmé
- **Limite utilisations** par billet

## 🚨 Erreurs Communes

### 1. "Invalid QR code"
- Vérifier intégrité données QR
- Confirmer signature valide

### 2. "Ticket already used"
- Billet déjà scanné
- Vérifier logs validation

### 3. "Ticket expired"
- Date événement passée
- Billet expiré (24h par défaut)

## 📈 Monitoring

```bash
# Billets générés
grep "ticket.*generated" logs/ticket.log

# Validations réussies
grep "validation.*success" logs/ticket.log

# Tentatives fraude
grep "fraud.*attempt" logs/ticket.log
```

## 💡 Tips Importants

- **Toujours** vérifier le paiement avant génération
- **Utiliser** des QR codes avec expiration
- **Sauvegarder** tous les logs de validation
- **Implémenter** des limites par utilisateur/IP

---

**🎫 Ce service transforme les transactions en expériences mémorables !**
