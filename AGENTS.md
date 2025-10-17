# Agent Steering Guide: Building the Workspace Provisioning Service

Welcome, AI Coding Agent. Your primary task is to implement the **Workspace Provisioning Service**, a backend microservice for the Secure Processing Environment (SPE) platform.

In addition to the Workspace Provisioning Service microservice implementation, this repository contains several context files designed to guide your implementation.


### Supporting Context Files

#### 1. The Big Picture: System Architecture

*   **File:** `ecosystem.md`
*   **Purpose:** This document describes the **high-level microservice architecture** of the entire SPE platform. It explains how the Workspace Provisioning Service interacts with other key services like the *Permit Manager Service* and the *Notification Service* via a message bus.
*   **How to use it:** Read this file to understand the **event-driven communication patterns**. When the blueprint specifies "publish an event," this document explains which service will be listening for that event and what they will do with it. This context is crucial for implementing the event publishing logic correctly.

#### 2. The Client's Perspective: Frontend Summary

*   **File:** `frontend.md`
*   **Purpose:** This document provides a **summary of the frontend web application** that will consume your API. It explains the frontend's architecture, its key features, and how those features map directly to the API endpoints you will be building.
*   **How to use it:** Use this document to understand the **user-facing purpose** of your API. It clarifies what the client application expects from each endpoint in terms of data and behavior, ensuring that your backend implementation meets the frontend's needs.

#### 3. The Definitive Reference: Frontend Source Code

*   **Folder:** `frontend_code_for_reference/`
*   **Purpose:** This directory contains the **complete source code for the frontend application**. It is the ultimate ground truth for how the client is implemented.
*   **How to use it:** This is a **reference-only** resource. You do not need to read all of it. Refer to it only if a specific detail about an API's expected response or behavior is unclear from the `frontend.md` summary or the `initial_blueprint.md`. The Mock Service Worker (MSW) handlers within `frontend_code_for_reference/src/mocks/handlers.js` are especially useful as an executable specification of the API contract.

#### 4. Permit Manager Summary

*   **File:** `permit-manager-service.md`
*   **Purpose:** This document provides a **summary of the permit manager microservice**.

#### 3. The Definitive Reference: Permit manager Source Code

*   **Folder:** `permit_manager_code_for_reference/`
*   **Purpose:** This directory contains the **complete source code for the permit manager application**. It is the ultimate ground truth for how the permit manager service is implemented.
*   **How to use it:** This is a **reference-only** resource. You do not need to read all of it. Refer to it only if a specific detail is unclear from the `permit-manager-service.md` summary or the `initial_blueprint.md`. 