# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sycapt Redcore AI** - Enterprise RAG (Retrieval-Augmented Generation) System with Hybrid Search (Keyword + Vector), Semantic Reranking, and Context-Aware AI Chat.

**Tech Stack:**

- Frontend: React (Vite) + TypeScript + Tailwind CSS + Zustand
- Backend: Node.js (Express) with ES modules
- Database: PostgreSQL with `pgvector` extension (dual-database architecture)
- AI Engine: Ollama (local LLM inference)

## Development Commands

### Starting Development

```bash
npm install                    # Install dependencies
npm run dev                    # Start both frontend (port 3000) and backend (port 3005) concurrently
npm run client                 # Frontend only (Vite dev server on port 3000)
npm run server                 # Backend only (nodemon on port 3005)
```

### Production Build

```bash
npm run build                  # Build frontend to /dist folder
npm start                      # Start production server (serves API + static frontend)
```

### Preview

```bash
npm run preview                # Preview production build locally
```

## Architecture

### Dual-Database Structure

The system uses **two separate PostgreSQL databases**:

1. **Main DB** (`sycapt_chatai` by default)
   - User authentication & profiles
   - Chat sessions and message history
   - Configured via `DB_NAME` environment variable
   - Accessed through `mainDb` pool in `server/config/db.js`

2. **Vector DB** (`docsvt` by default)
   - RAG document storage with embeddings
   - Uses `pgvector` extension for semantic search
   - Configured via `VECTOR_DB_NAME` environment variable
   - Accessed through `vectorDb` pool in `server/config/db.js`

**Important:** Always import both pools when working with RAG features:

```javascript
import { mainDb, vectorDb } from "../config/db.js";
```

### State Management (Zustand)

The frontend uses three separate Zustand stores in `store.ts`:

1. **useThemeStore** - Dark/light mode toggle with localStorage persistence
2. **useAuthStore** - JWT-based authentication, user profile management
3. **useChatStore** - Ephemeral chat state, message history, session management, streaming responses

### RAG Pipeline (server/controllers/chat.controller.js)

The system implements a multi-stage RAG pipeline:

1. **Query Rewriting** (`rewriteQuery`)
   - Analyzes conversation history using fast intent model (0.5b)
   - Resolves pronouns and context from previous messages
   - Determines if question is follow-up or new topic
   - 10-second timeout for responsiveness

2. **Hybrid Search** (`hybridSearch`)
   - **Vector Search**: Uses BGE-M3 embeddings with cosine similarity
   - **Keyword Search**: PostgreSQL full-text search (FTS) with `ts_rank_cd`
   - **Fusion**: Combines results using max similarity scoring
   - Returns top 50 candidates from both methods
   - Excludes `.xlsx` files from search

3. **Reranking** (`rerankResults`)
   - Cross-encoder scoring for semantic relevance
   - Uses specialized reranker model (BGE Reranker v2-m3)
   - Reduces candidates to top 5 most relevant chunks

4. **Generation** (streaming response)
   - Injects retrieved context into prompt
   - Streams response token-by-token via SSE
   - Includes citations with source metadata

### Frontend Components

- **App.tsx**: Main routing logic (Login → Admin Dashboard or Chat Interface based on role)
- **components/ChatInterface.tsx**: Primary chat UI with streaming, file attachments, citations
- **components/Sidebar.tsx**: Session management, new chat, history navigation
- **components/Login.tsx**: Authentication UI with registration
- **components/AdminDashboard.tsx**: Admin-only metrics and management
- **components/Layout.tsx**: Common layout wrapper with header and navigation

### Backend Structure

```
server/
├── index.js              # Express server, DB initialization, route mounting
├── config/
│   └── db.js            # Dual PostgreSQL pool configuration
├── controllers/
│   ├── auth.controller.js    # Login, register, JWT generation
│   └── chat.controller.js    # RAG pipeline, streaming, session management
├── routes/
│   ├── auth.routes.js   # /api/auth/* endpoints
│   └── chat.routes.js   # /api/chat/* endpoints
├── middleware/
│   ├── auth.middleware.js    # JWT verification
│   └── upload.middleware.js  # Multer file upload configuration
└── uploads/             # File upload storage directory
```

## Key Environment Variables

Required in `.env` file:

```bash
# Server
PORT=3005
NODE_ENV=development|production

# Dual Database Configuration
DB_HOST=10.0.1.159
DB_PORT=30104
DB_USER=admin
DB_PASSWORD=ปิดไว้นะจ๊ะ
DB_NAME=sycapt_chatai        # Main app database
VECTOR_DB_NAME=docsvt        # RAG vector database

# Authentication
JWT_SECRET=sycapt_redcore_secret_key_2024

# Ollama Models (ensure these are pulled via `ollama pull`)
OLLAMA_HOST=http://10.0.2.191:11434
OLLAMA_MODEL=bge-m3:latest              # Embeddings (1024 dimensions)
OLLAMA_CHAT_MODEL=gpt-oss:20b           # Main chat generation
OLLAMA_INTENT_MODEL=qwen2.5:14b         # Query rewriting
OLLAMA_MODEL_VISION=llava:latest        # Image analysis
OLLAMA_MODEL_RERANKER=qllama/bge-reranker-v2-m3:f16  # Semantic reranking
```

## Database Schema

### Main DB (sycapt_chatai)

```sql
-- Users with avatar support
CREATE TABLE "user" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  password VARCHAR(255) NOT NULL,  -- bcrypt hashed
  department VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',  -- 'user' or 'admin'
  avatar_url VARCHAR(255),
  avatar_data BYTEA,
  avatar_mimetype VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat sessions (groups messages)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL,
  title VARCHAR(255) DEFAULT 'New Chat',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

-- Individual messages
CREATE TABLE chat_history (
  id SERIAL PRIMARY KEY,
  session_id UUID,
  user_id INT,
  role VARCHAR(50) NOT NULL,  -- 'user' or 'assistant'
  content TEXT,
  thoughts JSONB,    -- Thinking steps displayed to user
  citations JSONB,   -- Source references
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
```

### Vector DB (docsvt)

```sql
-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Parent documents
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  document_name VARCHAR(255),
  content TEXT,
  metadata JSONB,
  ts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);
CREATE INDEX documents_ts_idx ON documents USING GIN (ts);

-- Document chunks with embeddings
CREATE TABLE document_chunks (
  id SERIAL PRIMARY KEY,
  doc_id INT,
  content TEXT,
  metadata JSONB,
  embedding vector(1024),  -- BGE-M3 embedding dimension
  FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX documents_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

## Important Patterns

### API Authentication

All protected routes require JWT token in Authorization header:

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Streaming Responses

Chat responses use Server-Sent Events (SSE):

```javascript
// Server sends
res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);

// Client receives
const reader = response.body.getReader();
const decoder = new TextDecoder();
// Parse SSE format: "data: {...}\n\n"
```

### File Uploads

Use FormData for avatar uploads during registration:

```javascript
const formData = new FormData();
formData.append("name", name);
formData.append("password", password);
formData.append("department", department);
if (avatar) formData.append("avatar", avatar);
```

### Session Management

- New sessions auto-created on first message if no `sessionId` provided
- Session titles default to "New Chat" (can be updated later)
- Session ID returned in streaming response: `{ type: 'session_created', sessionId }`
- Load previous sessions via `/api/chat/sessions/:sessionId`

## Production Deployment

1. Ensure PostgreSQL has `pgvector` extension enabled on both databases
2. Verify Ollama models are pulled: `ollama list` should show all required models
3. Build frontend: `npm run build` (generates `/dist` folder)
4. Set `NODE_ENV=production` in `.env`
5. Backend serves both API and static frontend from single port
6. Default production port: 3005 (configurable via `PORT` env var)

## Kubernetes Deployment

The application supports automated deployment to Kubernetes using GitLab CI/CD.

### Deployment Strategy

**Pipeline Stages:**

1. **Build**: Docker image built and pushed to GitLab Container Registry
2. **Deploy Staging**: Auto-deploy to `webclient-ai-staging` namespace on `dev` branch
3. **Deploy Production**: Manual deployment to `webclient-ai-production` namespace on `main` branch

**Architecture:**

- 2 replicas for high availability
- Rolling updates with zero downtime (maxSurge=1, maxUnavailable=0)
- Session affinity (ClientIP) for streaming connection stability
- Health checks on `/api/health` endpoint
- Resource limits: 500m-1000m CPU, 1-2Gi memory per pod
- emptyDir volume for temporary file uploads

### GitLab CI/CD Configuration

**Required Variables** (Settings → CI/CD → Variables):

Environment-specific (set for both staging and production):

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` (masked)
- `DB_NAME`, `VECTOR_DB_NAME`
- `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_CHAT_MODEL`, `OLLAMA_INTENT_MODEL`, `OLLAMA_MODEL_VISION`, `OLLAMA_MODEL_RERANKER`
- `JWT_SECRET` (masked, unique per environment)
- `NEXT_PUBLIC_N8N_WEBHOOK_URL` (optional)

Shared variables:

- `INGRESS_HOST_STAGING`: Staging domain (e.g., `webclient-ai-staging.company.com`)
- `INGRESS_HOST_PRODUCTION`: Production domain (e.g., `webclient-ai.company.com`)

### Deployment Commands

**Automated via GitLab:**

```bash
# Staging - auto-deploys on push to dev branch
git push origin dev

# Production - manual trigger required
# 1. Merge to main: git push origin main
# 2. Go to GitLab → CI/CD → Pipelines
# 3. Click "Deploy to Production" manual action
```

**Manual kubectl deployment:**

```bash
# Check deployment status
kubectl get pods -n webclient-ai-staging
kubectl get pods -n webclient-ai-production

# View logs
kubectl logs -n webclient-ai-staging -l app=webclient-ai --tail=100 -f

# Check rollout status
kubectl rollout status deployment/webclient-ai-internal -n webclient-ai-staging

# Rollback to previous version
kubectl rollout undo deployment/webclient-ai-internal -n webclient-ai-production

# Scale deployment
kubectl scale deployment/webclient-ai-internal --replicas=3 -n webclient-ai-production
```

### Troubleshooting K8s Deployments

**Pods not starting:**

```bash
kubectl describe pod <pod-name> -n webclient-ai-staging
kubectl get events -n webclient-ai-staging --sort-by='.lastTimestamp'
```

**Database connection issues:**

- Verify secrets exist: `kubectl get secrets -n webclient-ai-staging`
- Check environment variables: `kubectl exec -it <pod-name> -n webclient-ai-staging -- env | grep DB_`
- Test connectivity: `kubectl exec -it <pod-name> -n webclient-ai-staging -- nc -zv 10.0.1.159 30104`

**Ingress not accessible:**

- Check ingress controller: `kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx`
- Verify ingress: `kubectl describe ingress webclient-ai-ingress -n webclient-ai-staging`
- Check TLS certificate: `kubectl get certificate -n webclient-ai-staging`

**Application errors:**

- Stream logs: `kubectl logs -n webclient-ai-staging -l app=webclient-ai --tail=200 -f --prefix=true`
- Test health endpoint: `kubectl port-forward -n webclient-ai-staging svc/webclient-ai-service 8080:80` then `curl http://localhost:8080/api/health`

**Resource issues:**

- Check usage: `kubectl top pods -n webclient-ai-staging`
- Adjust limits in `k8s/base/deployment.yaml` if needed

### K8s Manifest Structure

```
k8s/
├── base/
│   ├── namespace.yaml      # Staging and production namespaces
│   ├── configmap.yaml      # Non-sensitive environment variables
│   ├── deployment.yaml     # Main application deployment
│   ├── service.yaml        # ClusterIP service with session affinity
│   └── ingress.yaml        # Nginx ingress with TLS
└── README.md               # Detailed K8s deployment guide
```

**Key manifest features:**

- Secrets created dynamically from GitLab CI/CD variables (not in git)
- Image tag replaced during pipeline: `REPLACE_IMAGE` → `$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA`
- Ingress host replaced per environment: `REPLACE_INGRESS_HOST` → staging/production domain
- Security context: non-root user (uid 1000), dropped capabilities
- Liveness probe: 30s interval, checks `/api/health`
- Readiness probe: 10s interval, 15s initial delay

For complete K8s documentation, see `k8s/README.md`.

## Thai Language Support

The system includes optimized Thai language processing:

- Embedding model (BGE-M3) supports multilingual text including Thai
- Query rewriting preserves target language (Thai/English)
- Full-text search configured for English but handles Thai via vector search
- Conversation history considers Thai character boundaries when truncating context
