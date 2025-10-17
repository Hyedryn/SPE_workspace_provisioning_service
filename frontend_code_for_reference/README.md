# SPE Web Portal

The SPE Web Portal is a role-aware React application that prototypes how HDAB staff, research teams, and data holders collaborate on secure permit workflows. The client is bundled with Vite, styled with Material UI, driven by Redux Toolkit state, and backed by a comprehensive Mock Service Worker (MSW) API for local development.

## Feature Highlights
- **Multi-role experience:** Authenticated routing provides tailored dashboards for HDAB staff, health data users, and data holders while reusing shared permit detail views. `ProtectedRoute` guards routes using wildcard-friendly role strings and honours the super admin override.
- **Permit operations:** HDAB users can triage permit queues, inspect permit metadata, launch workspaces, and manage which data holders are connected to a permit. Permit managers can assign HDAB teammates directly from the permit detail view.
- **Researcher tooling:** Project members can review their assigned permits, request analysis workspaces, submit outputs, and manage the project team roster.
- **Data holder workflows:** The data ingress section lets data holders retrieve permit context and upload artefacts that the HDAB team reviews downstream.
- **Audit visibility:** Activity logs summarise recent permit actions with pagination, filters, and role-aware visibility to ensure staff only see the permits they are assigned.
- **Internationalisation:** The UI is wired to i18next with English, French, and Dutch resource bundles loaded from `/public/locales`. Suspense-powered language detection enables instant language switching.

## Architecture at a Glance
| Layer | Details |
| --- | --- |
| Framework & Tooling | React 19 + Vite with fast-refresh and JSX transform support. |
| Styling | Material UI v5 theming centralised in `src/theme.js` with design tokens for colour, type, and shape. |
| State management | Redux Toolkit store (`src/app/store.js`) combining auth, permits, outputs, UI, and audit slices with typed hooks for access. |
| Networking | Axios client (`src/api/client.js`) scoped to `/api` endpoints. Feature-specific APIs live under `src/api/`. |
| Authentication | MSW-backed auth endpoints hydrate the Redux store; `ProtectedRoute` enforces login and role checks before rendering nested routes. |
| Internationalisation | `src/i18n.js` configures i18next, HTTP backend loading, and browser language detection. |
| Mock backend | MSW worker (`src/mocks/browser.js`) spins up automatically in development and serves realistic responses for auth, permits, outputs, audit history, HDAB staff search, and workspace flows. |

## Project Structure
```
src/
├── api/                # Axios clients for auth, permits, outputs, audit, workspaces, data holders
├── app/                # Redux store wiring and shared selectors
├── assets/             # Static assets imported through Vite
├── components/         # Reusable UI building blocks (cards, tables, dialogs)
├── features/           # Domain slices, thunks, and selectors for auth, permits, outputs, audit, UI
├── hooks/              # Typed hooks such as dispatch, selector, and permit permission helpers
├── layouts/            # Application shell for authenticated pages
├── mocks/              # MSW handlers, mock data, and worker bootstrap
├── pages/              # Route-level screens (dashboard, permits, workspaces, outputs, ingress, etc.)
├── routes/             # Routing helpers including role-based protection
├── theme.js            # Material UI theme definition
├── i18n.js             # i18next initialisation
└── utils/              # Role helpers, formatters, and shared utilities
```

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Start the development server**
   ```bash
   npm run dev
   ```
   The app runs on <http://localhost:5173> by default. In development, the MSW browser worker automatically starts so every `/api` request is served by the mock backend.
3. **Run linting**
   ```bash
   npm run lint
   ```
4. **Create a production build**
   ```bash
   npm run build
   ```
5. **Preview the production bundle**
   ```bash
   npm run preview
   ```

## Development Notes
- **Mock data personas:** Sample super admins, HDAB staff, permit managers, project members, and data holders are defined inside `src/mocks/data.js` along with seeded permits and audit history to exercise the role-based experiences end-to-end.
- **Session lifecycle:** On app boot `fetchUser` runs to resolve the current session. Logging out via the auth slice resets the Redux store to its initial state to prevent data leaks across users.
- **Extending APIs:** Add new endpoints to `src/mocks/handlers.js` alongside any matching mock data. When connecting to a live backend, remove the MSW bootstrap in `src/main.jsx` or disable it via an environment flag.
- **Translations:** Update or add locale files in `public/locales/<language>/translation.json`. New namespaces can be added by extending the i18n configuration.
- **Theming:** Adjust the primary design system tokens centrally in `src/theme.js` to cascade updates across all Material UI components.
