#!/bin/bash

# 🎫 Test Automatique - Ticket Generator Service
# Test toutes les routes avec données simulées

BASE_URL="http://localhost:3004"
FAILED_TESTS=0
TOTAL_TESTS=0

echo "🚀 DÉMARRAGE TESTS AUTOMATIQUES - TICKET-GENERATOR-SERVICE"
echo "=========================================================="

# Fonction de test
test_route() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    local expected_status=${5:-200}
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    echo "📍 Test $TOTAL_TESTS: $description"
    echo "   $method $url"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$url")
    fi
    
    # Séparer le corps et le status code
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo "   ✅ SUCCÈS (Status: $status_code)"
        echo "   📄 Response: $(echo "$body" | jq -r '.message // .success // "OK"' 2>/dev/null || echo "$body" | head -c 100)..."
    else
        echo "   ❌ ÉCHEC (Status: $status_code, attendu: $expected_status)"
        echo "   📄 Response: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Vérifier si le service est démarré
echo ""
echo "🔍 Vérification santé du service..."
health_response=$(curl -s "$BASE_URL/health")
if echo "$health_response" | grep -q "healthy"; then
    echo "   ✅ Service opérationnel"
else
    echo "   ❌ Service non disponible - Démarrage requis"
    exit 1
fi

# 1. Test Health Check
test_route "GET" "/health" "" "Health Check" 200

# 2. Test Route Racine
test_route "GET" "/" "" "Route Racine" 200

# 3. Test API Racine
test_route "GET" "/api" "" "API Racine" 200

# 4. Test POST /api/tickets/qr/generate
qr_data='{
  "ticketCode": "TICKET_123456789",
  "ticketId": "ticket_abc123",
  "eventId": "event_xyz789",
  "format": "base64",
  "size": "medium"
}'
test_route "POST" "/api/tickets/qr/generate" "$qr_data" "Générer QR Code" 201

# 5. Test POST /api/tickets/generate
ticket_data='{
  "ticketData": {
    "id": "ticket_abc123",
    "eventId": "event_xyz789",
    "userId": "user_123456",
    "type": "standard",
    "attendeeInfo": {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+33612345678"
    }
  },
  "options": {
    "qrFormat": "base64",
    "qrSize": "medium",
    "pdfFormat": true
  }
}'
test_route "POST" "/api/tickets/generate" "$ticket_data" "Générer Ticket" 201

# 6. Test POST /api/tickets/batch
batch_data='{
  "tickets": [
    {
      "id": "ticket_abc123",
      "eventId": "event_xyz789",
      "userId": "user_123456",
      "type": "standard",
      "attendeeInfo": {
        "name": "Alice Smith",
        "email": "alice@example.com"
      }
    },
    {
      "id": "ticket_def456",
      "eventId": "event_xyz789",
      "userId": "user_123456",
      "type": "vip",
      "attendeeInfo": {
        "name": "Bob Johnson",
        "email": "bob@example.com"
      }
    }
  ],
  "batchOptions": {
    "qrFormat": "base64",
    "qrSize": "medium",
    "pdfFormat": true,
    "parallelGeneration": true
  }
}'
test_route "POST" "/api/tickets/batch" "$batch_data" "Générer Tickets en Lot" 201

# 7. Test POST /api/tickets/pdf
pdf_data='{
  "ticketData": {
    "id": "ticket_abc123",
    "eventId": "event_xyz789",
    "userId": "user_123456"
  },
  "eventData": {
    "id": "event_xyz789",
    "name": "Tech Conference 2026",
    "date": "2026-06-15"
  },
  "userData": {
    "id": "user_123456",
    "name": "John Doe",
    "email": "john.doe@example.com"
  },
  "options": {
    "templateId": "template_default",
    "pdfOptions": {
      "format": "A4",
      "orientation": "portrait",
      "includeWatermark": false
    }
  }
}'
test_route "POST" "/api/tickets/pdf" "$pdf_data" "Générer PDF" 201

# 8. Test POST /api/tickets/batch-pdf
batch_pdf_data='{
  "tickets": [
    {
      "id": "ticket_abc123",
      "eventId": "event_xyz789",
      "userId": "user_123456"
    },
    {
      "id": "ticket_def456",
      "eventId": "event_xyz789",
      "userId": "user_123456"
    }
  ],
  "eventData": {
    "id": "event_xyz789",
    "name": "Tech Conference 2026",
    "date": "2026-06-15"
  },
  "options": {
    "templateId": "template_default",
    "batchOptions": {
      "format": "A4",
      "includeWatermark": true
    }
  }
}'
test_route "POST" "/api/tickets/batch-pdf" "$batch_pdf_data" "Générer PDFs en Lot" 201

# 9. Test POST /api/tickets/validate
validate_data='{
  "ticketCode": "TICKET_123456789",
  "ticketId": "ticket_abc123",
  "eventId": "event_xyz789"
}'
test_route "POST" "/api/tickets/validate" "$validate_data" "Valider Ticket" 200

# 10. Test GET /api/tickets/ticket_abc123/qr
test_route "GET" "/api/tickets/ticket_abc123/qr" "" "Obtenir QR Code" 200

# 11. Test GET /api/tickets/ticket_abc123/pdf
test_route "GET" "/api/tickets/ticket_abc123/pdf" "" "Obtenir PDF" 200

# 12. Test GET /api/tickets/ticket_abc123
test_route "GET" "/api/tickets/ticket_abc123" "" "Obtenir Détails Ticket" 200

# 13. Test GET /api/tickets/event/event_xyz789
test_route "GET" "/api/tickets/event/event_xyz789" "" "Obtenir Tickets Événement" 200

# 14. Test POST /api/tickets/ticket_abc123/regenerate
regenerate_data='{
  "reason": "Damaged ticket",
  "regenerateQR": true,
  "regeneratePDF": true
}'
test_route "POST" "/api/tickets/ticket_abc123/regenerate" "$regenerate_data" "Régénérer Ticket" 200

# 15. Test DELETE /api/tickets/ticket_abc123
test_route "DELETE" "/api/tickets/ticket_abc123" "" "Supprimer Ticket" 200

# Résumé des tests
echo ""
echo "=========================================================="
echo "📊 RÉSUMÉ DES TESTS"
echo "=========================================================="
echo "📈 Total tests: $TOTAL_TESTS"
echo "✅ Réussis: $((TOTAL_TESTS - FAILED_TESTS))"
echo "❌ Échoués: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo "🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !"
    echo "✅ Le service ticket-generator fonctionne correctement"
    exit 0
else
    echo ""
    echo "⚠️  $FAILED_TESTS test(s) ont échoué"
    echo "🔧 Vérifiez les logs pour plus de détails"
    exit 1
fi
