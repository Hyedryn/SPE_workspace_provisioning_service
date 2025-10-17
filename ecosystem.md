# SPE Platform: Microservice Ecosystem Architecture

## 1. Introduction

This document provides a high-level overview of the Secure Processing Environment (SPE) platform's microservice architecture. Its purpose is to contextualize the role of individual services, like the **Permit Manager**, within the broader system. It defines the responsibilities of each major service and describes the primary event-driven communication patterns they use to collaborate and orchestrate the full SPE project lifecycle.

The architecture is designed to be **decoupled, scalable, and event-driven**. No single service holds all the logic. Instead, each service has a distinct responsibility and communicates state changes by publishing events to a central **Message Bus** (e.g., RabbitMQ). Other services subscribe to these events and react accordingly, triggering their own specific workflows.

## 2. Core Architectural Principles

-   **Single Responsibility Principle:** Each microservice has one primary job (e.g., managing permits, provisioning workspaces).
-   **Loose Coupling:** Services do not call each other directly via synchronous APIs for core workflow orchestration. They communicate asynchronously through events. This ensures that the failure of one service does not cascade and bring down the entire system.
-   **Centralized API Gateway:** All external requests from the **SPE Web Portal** enter through a single, secure **API Gateway** (e.g., Kong). The gateway handles authentication, rate limiting, and routing to the appropriate internal service.
-   **Shared Infrastructure:** All services run within a **Container Orchestration Layer** (e.g., Kubernetes) and share access to common infrastructure like the Message Bus and the central Auditing Service.

## 3. Key Microservices & Their Responsibilities

The SPE platform is composed of several key microservices. The **Permit Manager** is the heart of the workflow logic, but it relies on other services to execute infrastructure-level and user-facing tasks.

### 3.1. Permit Manager Service
-   **Core Responsibility:** Manages the state and lifecycle of data permits.
-   **What it does:**
    -   Acts as the source of truth for a permit's status (e.g., `DATA_PREPARATION_PENDING`, `ANALYSIS_ACTIVE`).
    -   Manages the permit's associated teams (Research Team, HDAB Team, Data Holders).
    -   Handles the business logic for transitions between stages (e.g., approving a setup review).
-   **What it does NOT do:** It does not create VMs, manage file storage, or send user notifications directly.
-   **Key Interaction:** It **publishes events** about permit state changes (e.g., `permit.ingress.initiated`, `permit.analysis.approved`) that other services consume.

### 3.2. Workspace Provisioning Service (The "Orchestrator")
-   **Core Responsibility:** Manages the entire lifecycle of secure virtual machine (VM) and container workspaces.
-   **What it does:**
    -   **Listens** for events from the Permit Manager (e.g., `permit.ingress.initiated`).
    -   Interacts directly with the **Container Orchestration Layer** (Kubernetes) to create, configure, start, stop, and destroy workspaces (e.g., Ingress Airlock, Preprocessing VM, Analysis VM).
    -   Manages the mounting of storage volumes (`/raw`, `/prepared`, `/outputs`) into the workspaces.
    -   Configures network policies and firewall rules for each workspace (e.g., enabling/disabling internet access).
-   **What it does NOT do:** It does not know the business logic of *why* a workspace needs to be created; it only acts on instructions received as events.
-   **Key Interaction:** It **consumes** events like `permit.status.updated` and `permit.ingress.initiated` and translates them into infrastructure commands.

### 3.3. Notification Service
-   **Core Responsibility:** Manages all user-facing communications.
-   **What it does:**
    -   **Listens** for events from various services (e.g., `permit.setup.approved`, `permit.egress.rework_requested`).
    -   Sends emails, in-app notifications (via WebSockets), or other alerts to the relevant users.
    -   Uses templates to format messages appropriately for the context.
-   **What it does NOT do:** It does not contain any core business logic.
-   **Key Interaction:** It **consumes** a wide range of events and translates them into user notifications.

### 3.4 Authentification Service (IAM)

### 4. High-Level Interaction Flow: The "Environment Setup" Phase

To illustrate how these services interact, let's trace the flow for **BPMN 3: Environment Setup & Review**.

**Goal:** The researcher needs to configure their data-free "Setup VM", submit it for review, and get it approved so it can be converted into an "Analysis VM" with data.

1.  **Permit Manager:** The permit status is `WORKSPACE_SETUP_PENDING`.
    -   The Permit Manager publishes a `permit.status.updated` event with the new status.

2.  **Workspace Provisioning Service:**
    -   It consumes the `permit.status.updated` event.
    -   Seeing the status is `WORKSPACE_SETUP_PENDING`, it executes its logic:
        -   It calls the **Container Orchestrator (Kubernetes)** to provision a new "Setup VM".
        -   It configures the VM with limited, proxied internet access.
        -   It **does not** mount any sensitive data volumes.

3.  **Notification Service:**
    -   It also consumes the `permit.status.updated` event.
    -   Seeing the status, it sends a notification to the researcher: "Your workspace is ready for setup."

4.  **Researcher -> API Gateway -> Permit Manager:**
    -   The researcher finishes their setup and clicks "Submit for Review" in the **SPE Web Portal**.
    -   This sends a `POST /api/permits/{id}/workspace/submit-for-review` request.
    -   The **Permit Manager** handles this request. It validates that the user is allowed to do this and that the permit is in the correct state.
    -   It updates the permit status to `WORKSPACE_SETUP_REVIEW_PENDING` and publishes a new `permit.status.updated` event.

5.  **Workspace Provisioning Service (Reacts again):**
    -   It consumes the new `permit.status.updated` event.
    -   Seeing the status is `WORKSPACE_SETUP_REVIEW_PENDING`, it executes its logic:
        -   It calls Kubernetes to **disable internet access** for the VM.
        -   It "freezes" the environment, making it ready for review.

6.  **Notification Service (Reacts again):**
    -   It consumes the same event and sends a notification to the assigned HDAB Reviewer: "A workspace is ready for your review."

7.  **HDAB Reviewer -> API Gateway -> Permit Manager:**
    -   The reviewer inspects the environment and clicks "Approve" in the portal.
    -   This sends a `POST /api/permits/{id}/review` request with `{ "stage": "SETUP", "decision": "APPROVED" }`.
    -   The **Permit Manager** validates and updates the permit status to `ANALYSIS_ACTIVE`.
    -   It publishes the final `permit.status.updated` event for this phase.

8.  **Workspace Provisioning Service (Final reaction):**
    -   It consumes the `ANALYSIS_ACTIVE` event.
    -   It calls Kubernetes to reconfigure the VM:
        -   Ensures internet is permanently disabled.
        -   **Mounts the `/prepared_data` volume as read-only.**
        -   The "Setup VM" has now effectively become the "Analysis VM".

This event-driven flow ensures that the **Permit Manager** remains the central orchestrator of the *business process*, while the **Workspace Provisioning Service** is the expert in translating those business needs into concrete *infrastructure actions*. This separation is the key to building a scalable and maintainable system.
