# Project File Structure Analysis

## 📂 Server

│ **index.js** : Main entry point. Sets up Express app, middleware, CORS, and connects to the database.
│  
├───**config**
│ **db.js** : Database connection management for Main DB (PostgreSQL) and Vector DB (pgvector).
│ **ragConfig.js** : Centralized configuration for the RAG pipeline (Search thresholds, Chunk limits, LLM temperature).
│
├───**controllers**
│ **auth.controller.js** : Handles user authentication logic (Login, Logout, Session management).
│ **chat.controller.js** : Core Chat Logic. Orchestrates Intent Analysis, Search (RAG), Reranking, and Streaming Responses.
│
├───**middleware**
│ **auth.middleware.js** : Security middleware to verify user sessions/tokens before accessing protected routes.
│ **upload.middleware.js** : Middleware for handling file upload requests (e.g. for document ingestion).
│
├───**routes**
│ **auth.routes.js** : Defines API endpoints for authentication (e.g., /api/auth/login).
│ **chat.routes.js** : Defines API endpoints for chat operations (e.g., /api/chat/send, /history, /sessions).
│
├───**scripts**
│ add*mantis_fts.js : Adds Full-Text Search capabilities to Mantis issue data in the database.
│ check_auth_db.js : Verifies connection and schema consistency of the Authentication Database.
│ check_columns.js : Checks for existence of specific columns in database tables.
│ check_db_count.js : Counts rows in key tables to verify data presence.
│ check_duplicate_descriptions.js : Detects duplicate content descriptions in the database.
│ check_extension.js : Checks if necessary DB extensions (like pgvector) are installed.
│ check_images_schema_new.js : Validates the schema of the image storage table.
│ check_image_data.js : Verifies the integrity of stored image binaries/data.
│ check_sequence_diagram.js : Checks data related to sequence diagram generation features.
│ check_specific_image.js : Utility to inspect a specific image by ID.
│ check_user_schema.js : Validates the structure of the User table.
│ check_vector_maindb.js : Diagnostics for the Vector Database connection.
│ check_vhq.js : Specific health check for 'VHQ' project data.
│ check_vhq_proj.js : Verifies project-specific metadata for VHQ.
│ clear_history.js : Utility to wipe all chat history from the database.
│ debug_context.js : Helper to inspect the exact context being sent to the LLM during RAG.
│ debug_db_connection.js : Low-level database connection debugger.
│ debug_db_schema.js : Prints the current database schema for debugging.
│ debug_history.js : Inspects stored chat history records.
│ debug_images_db.js : Debugger for image retrieval logic.
│ debug_integration.js : Tests the end-to-end integration of services.
│ debug_mantis.js : Debugs retrieval specifically for Mantis issues.
│ debug_memories_content.js : Inspects contents of the Conversational Memory table.
│ debug_vhq_advanced.js : Advanced queries to debug retrieval issues in VHQ project.
│ debug_vhq_retrieval.js : Tests retrieval precision for VHQ-related queries.
│ init_memory_db.js : Initializes the database tables required for Conversational Memory.
│ inspect_vhq_content.js : Dumps content of VHQ documents for manual inspection.
│ list_users.js : Lists all registered users in the system.
│ simple_check.js : Minimal connectivity ping test.
│ test_auth_api.js : Tests authentication API endpoints.
│ test_controller_integration.js : Integration test for the Chat Controller flow.
│ test_memory_trigger.js : Tests the logic that triggers memory summarization.
│ test_retrieval.js : General purpose script to test search results for a query.
│ test_search_scoring.js : Analyzes how search scores are calculated (Vector vs Keyword).
│ test_similarity.js : Tests cosine similarity calculations in the DB.
│
├───**services**
│ **llmService.js** : Interface for standard LLM calls (Ollama) and Reranking logic (The "Judge" model).
│ **memoryService.js** : Manages Long-term Memory. Summarizes sessions and retrieves past context.
│ **retrievalService.js** : The Search Engine. Handles Hybrid Search (Vector + Text), Image Search, and Mantis Search.
│
├───**tests_database**
│ debug*ปิดไว้นะจ๊ะ*automation.js : Debugging script for ปิดไว้นะจ๊ะ project automation data.
│ evaluate_generation.js : Script to evaluate the quality of LLM generated answers.
│ evaluate_retrieval.js : Script to measure retrieval accuracy (Recall/Precision).
│ golden_dataset.json : Reference dataset of Question-Answer pairs for evaluation.
│ image_database.json : Reference metadata for images used in testing.
│ test*ปิดไว้นะจ๊ะ_mantis.js : Specific tests for retrieving ปิดไว้นะจ๊ะ Mantis issues.
│ test_load.js : Stress testing script for database or API performance.
│ test_mantis_retrieval.js : Evaluates search performance for Mantis queries.
│ test_performance.js : Benchmarks query latency and system speed.
│ test_split.js : Tests text splitting/chunking logic.
│
└───**uploads** : Directory for storing temporarily uploaded files for ingestion.

## 📂 Components (Client)

│ **AdminDashboard.tsx** : Admin interface for monitoring usage, users, or system stats.
│ **Auth.tsx** : Authentication wrapper that safeguards protected routes.
│ **ChatInterface.tsx** : The main Chat View. Handles user input, displays messages, renders markdown/images, and manages streaming state.
│ **Layout.tsx** : The main application shell ( Sidebar + Content Area structure).
│ **Login.tsx** : User Login page component.
│ **Sidebar.tsx** : Side navigation bar displaying Chat History and Session controls.
│  
└───**ui** : Folder containing reusable atomic UI elements (Buttons, Inputs, Cards, etc.)
