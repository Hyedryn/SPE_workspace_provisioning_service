# SPE Web Portal: Frontend Architecture Summary

## 1. Introduction & Purpose

This document provides a high-level summary of the **SPE Web Portal**, the React-based frontend application that serves as the primary user interface for all actors in the SPE ecosystem. Its purpose is to give backend developers and AI coding agents a clear understanding of the client-side implementation, its architecture, and how it interacts with the backend API.

The complete frontend source code is available for reference in the `frontend_code_for_reference/` directory at the root of this project. While this summary provides the necessary context, the agent may refer to the source code for specific implementation details, such as component logic, state management, and exact API client usage.

## 2. Core Technology Stack

-   **Framework:** React 19
-   **Build Tool:** Vite
-   **State Management:** Redux Toolkit
-   **UI Library:** Material UI (MUI) v5
-   **Routing:** React Router v6
-   **Networking:** Axios
-   **Internationalization (i18n):** i18next
-   **Development Mocking:** Mock Service Worker (MSW)

## 3. Architectural Overview

The frontend is a **Single-Page Application (SPA)** that provides a dynamic, role-aware user experience.

-   **Component-Based:** The UI is built from a hierarchy of reusable React components located in `src/components/`.
-   **Centralized State:** Redux Toolkit is the single source of truth for global application state. State is organized into "slices" (e.g., `authSlice`, `permitsSlice`) found in `src/features/`. These slices manage data fetching, caching, and state updates in a predictable way.
-   **API Abstraction:** All communication with the backend is handled through dedicated API client modules in `src/api/`. These modules use an Axios instance and export functions for each endpoint (e.g., `getPermitById`, `submitOutput`). This decouples components from the raw network requests.
-   **Protected Routes:** Application routes are protected using a `ProtectedRoute` component that checks for a valid authentication state in the Redux store and verifies user roles against the route's requirements. This ensures that users can only access pages and features they are authorized for.

## 4. Key Features & Corresponding Backend Interactions

The frontend implements several key features that directly map to backend API endpoints. The AI agent should use this as a guide to understand the client's expectations for each API call.

### 4.1. Authentication & User Session
-   **Login Page (`/login`):** Submits credentials to `POST /api/auth/login`.
-   **App Initialization:** On startup, it calls `GET /api/me` to fetch the current user's profile and roles, which hydrates the `authSlice` and determines the user's view.
-   **Logout:** Calls `POST /api/auth/logout` and clears all Redux state.

### 4.2. Permit Lifecycle Management
-   **Dashboard & Permit Lists (`/dashboard`, `/permits`):** Fetches accessible permits by calling `GET /api/permits`.
-   **Permit Detail Page (`/permits/{id}`):**
    -   Fetches detailed permit data, including teams and output summaries, via `GET /api/permits/{permitId}`.
    -   Displays role-specific action buttons that trigger state transitions. For example, an HDAB Reviewer's "Approve Preparation" button calls **`POST /api/permits/{permitId}/review`** with the appropriate payload (`{ "stage": "PREPARATION", "decision": "APPROVED" }`).
-   **Team Management:**
    -   The Principal Investigator can invite users via a dialog, which calls **`POST /api/permits/{permitId}/team/invite`**.
    -   They can remove users, which calls **`DELETE /api/permits/{permitId}/team/{memberId}`**.
-   **HDAB Team Management:**
    -   The HDAB Permit Manager uses a dialog to search for staff (`GET /api/hdab/staff`) and assign them to a permit with a specific role (**`POST /api/permits/{permitId}/hdab-team`**).

### 4.3. Secure Workspace Access
-   **Workspace Page (`/workspace/...`):**
    -   Regularly polls **`GET /api/permits/{permitId}/workspace/status`** to display the VM's state (Running, Stopped).
    -   Provides "Start" and "Stop" buttons that call **`POST /api/permits/{permitId}/workspace/start`** and **`POST /api/permits/{permitId}/workspace/stop`**, respectively.
    -   When the workspace is running, it fetches connection details from **`GET /api/permits/{permitId}/workspace/connection`**.
    -   These details are used to initialize an embedded **Apache Guacamole** client, streaming the remote desktop directly in the browser.

### 4.4. Egress (Output) Workflow
-   **Submit Output Page (`/outputs/new`):** A form that collects a folder path and justification, then submits it via **`POST /api/permits/{permitId}/outputs`**.
-   **Outputs Panel (on Permit Detail page):**
    -   Lists all submissions for a permit by calling **`GET /api/permits/{permitId}/outputs`**.
    -   For **HDAB Reviewers**, it provides a review interface that calls **`POST /api/permits/{permitId}/outputs/{outputId}/review`** with a decision.
    -   For **Researchers**, it shows the status of their submissions and provides a download button for approved outputs. This button first calls **`GET /api/permits/{permitId}/outputs/{outputId}/download-link`** to get a secure, one-time URL, and then opens that URL.

### 4.5. Auditing
-   **Activity Log (`/activity-log`):**
    -   Fetches a detailed, paginated, and filterable list of actions for a selected permit by calling **`GET /api/permits/{permitId}/activity`**.
    -   The API is expected to support filtering by date range, action type, and a free-text search query.
    -   The API is also expected to return a list of available `actionTypes` in its response (`facets`) to populate the filter dropdown.

## 5. Mock Service Worker (MSW)

The frontend includes a comprehensive mock API located in `src/mocks/`. This is the **definitive reference for the expected behavior, data shapes, and status codes of the backend API**. The AI agent should treat the MSW handlers in `src/mocks/handlers.js` as a live, executable specification of the API it needs to build. All business logic, authorization rules, and data transformations mocked in the handlers should be implemented for real in the backend service.