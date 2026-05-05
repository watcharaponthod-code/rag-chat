# Project File Structure Analysis

This document provides a detailed analysis of the project's file structure, describing the purpose and functionality of each file in the `server` and `components` directories.

## 📂 Server Structure

The backend appears to be a Node.js/Express application implementing a RAG (Retrieval-Augmented Generation) system with Ollama for LLM capabilities.

### Root

- **`index.js`**: The main entry point for the server. It likely sets up the Express app, middleware, routes, and starts the server listening on a port.

### 📁 config

Configuration files for the application.

- **`db.js`**: Manages database connections, likely exporting connection pools or clients for PostgreSQL (Main DB and Vector DB).
- **`ragConfig.js`**: specific configuration for the RAG pipeline, such as context window sizes, chunk limits, LLM temperature settings, and model names.

### 📁 controllers

Logic handlers for API routes.

- **`auth.controller.js`**: Handles user authentication operations (Login, Register, Logout).
- **`chat.controller.js`**: The core logic for the chat application. It orchestrates:
  - Session management (create/update).
  - Intent analysis (using `llmService`).
  - Search & Retrieval (using `retrievalService`).
  - Reranking and Context assembly.
  - Streaming responses from the LLM back to the client.

### 📁 middleware

Express middleware functions.

- **`auth.middleware.js`**: Security middleware that verifies user authentication (likely JWT or session-based) before allowing access to protected routes.
- **`upload.middleware.js`**: Middleware for handling file uploads (e.g., documents for ingestion), likely using libraries like `multer`.

### 📁 routes

API Route definitions that map URLs to Controllers.

- **`auth.routes.js`**: Defines endpoints for authentication (e.g., `/api/auth/login`).
- **`chat.routes.js`**: Defines endpoints for chat features (e.g., `/api/chat/send`, `/api/chat/history`, `/api/chat/sessions`).

### 📁 services

Business logic and external service integrations.

- **`llmService.js`**: Interface for interacting with the LLM (Ollama).
  - Functions: `callOllama` (generic generation), `rewriteQuery` (contextualizing queries), `analyzeIntent` (routing strategies), `rerank` (ordering search results), `streamResponse`.
- **`memoryService.js`**: Manages Conversational Memory. Handles summarizing chat sessions into long-term memory and retrieving relevant past context.
- **`retrievalService.js`**: Handles the search logic. Performs vector searches, full-text searches, and hybrid retrieval from the database to find relevant documents/images.

### 📁 scripts

A collection of maintenance, debugging, and initialization scripts.

**Initialization & Schema:**

- `init_memory_db.js`: Sets up database tables for the memory system.
- `add_mantis_fts.js`: Adds Full-Text Search indices/capabilities for Mantis bug data.

**Checks & Validations (Health Checks):**

- `check_auth_db.js`: Verifies connection to the authentication database/tables.
- `check_columns.js`, `check_db_count.js`, `check_user_schema.js`, `check_images_schema_new.js`: Validate database schema integrity and row counts.
- `check_vector_maindb.js`: Checks the vector database status.
- `check_extension.js`: Verifies PostgreSQL extensions (like `pgvector`).
- `simple_check.js`: Likely a basic connectivity ping.

**Debugging (Diagnostics):**

- `debug_context.js`: helper to inspect what context is being sent to the LLM.
- `debug_db_connection.js`, `debug_db_schema.js`: Deep dive into DB connection issues.
- `debug_history.js`, `debug_memories_content.js`: Inspect chat history and stored memories.
- `debug_images_db.js`: Checks image storage and retrieval.
- `debug_integration.js`: Tests the flow between components.
- `debug_mantis.js`: Debugs Mantis-specific retrieval logic.
- `debug_vhq_advanced.js`, `debug_vhq_retrieval.js`: Specific debugging for "VHQ" project retrieval.

**Tests (Standalone functionality):**

- `test_auth_api.js`: Tests auth endpoints.
- `test_controller_integration.js`: Tests the full controller flow.
- `test_memory_trigger.js`: Verifies if memory summarization triggers correctly.
- `test_retrieval.js`: Tests the search accuracy/results.
- `test_search_scoring.js`, `test_similarity.js`: Evaluates vector similarity scoring.
- `list_users.js`: Utility to list registered users.
- `clear_history.js`: Utility to wipe chat history.

### 📁 tests_database

Specific scripts for evaluating database performance and retrieval quality.

- `evaluate_generation.js`, `evaluate_retrieval.js`: Scripts to measure RAG accuracy metrics.
- `golden_dataset.json`: A reference dataset of questions and expected answers for testing.
- `image_database.json`: Reference data for images.
- `test_performance.js`: Benchmarks system query speed.
- `test_load.js`: Load testing script.
- `test_ปิดไว้นะจ๊ะ_mantis.js`, `test_mantis_retrieval.js`: Specific tests for "Mantis" data retrieval (ปิดไว้นะจ๊ะ project).

---

## 📁 Components Structure (Client)

The frontend appears to be a React-based application (TypeScript).

### Core Components

- **`AdminDashboard.tsx`**: A dashboard interface for administrators (likely for managing users, viewing stats, or system config).
- **`Auth.tsx`**: A higher-order component or wrapper handling authentication state/logic (protecting routes).
- **`Login.tsx`**: The user interface for logging in.
- **`Layout.tsx`**: Defines the common page structure (Sidebar, Main Content Area).
- **`Sidebar.tsx`**: Navigation sidebar, likely displaying Chat History lists and user settings.
- **`ChatInterface.tsx`**: The main view for the Chatbot.
  - Handles user input.
  - Displays the conversation stream (User and AI buปิดไว้นะจ๊ะes).
  - Shows "Thoughts" or status updates from the AI.
  - Likely renders the "Knowledge Panel" (images/citations).

### 📁 ui

- **`ui/`**: Directory containing reusable, atomic UI components (e.g., Buttons, Inputs, Cards, Modals) used by the larger components above.
