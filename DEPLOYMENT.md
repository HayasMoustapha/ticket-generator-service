# Déploiement — Ticket Generator Service

**Service**: `ticket-generator-service`  
**Port**: `3004`

---

## 1. Prérequis

1. PostgreSQL (DB: `event_planner_ticket`)
2. Redis (queues)
3. Node.js LTS + npm

---

## 2. Variables d’Environnement

1. Copier `.env.example` → `.env`
2. Renseigner:
   - DB + Redis
   - Chemins de stockage des tickets générés
   - `JWT_SECRET` (si utilisé)
3. Vérifier les permissions d’écriture sur le dossier de stockage

---

## 3. Installation

```
npm install
```

---

## 4. Démarrage

```
npm run start
```

---

## 5. Healthcheck

```
GET http://localhost:3004/api/health
```
