# BuildingMap Prototype

This folder contains a self-contained interactive prototype for the BuildingMap web app brief.

Open `index.html` locally, or upload `Planner.html` with `app.js`, `styles.css`, `config.js`, and the `assets` folder for the hosted planner page.

- Project dashboard and mobile-style navigation
- Colour-coded project folders for large builds such as apartments, towers, or stages
- Google Drive structure preview for `/NeillPlanner/Admin Files/` and `/NeillPlanner/Projects/`
- Interactive floor plan with zoom, pan, filtering, and tappable nodes
- Node creation and editing
- Node drawer with notes, images, comments, status updates, audit trail, sharing, and QR action
- Progress dashboard and audit table
- Google Drive, Sheets, OAuth, PWA, and notification states represented as app surfaces ready for integration

The prototype stores edits in browser local storage. No Google, Firebase, or Next.js credentials are required.

For Google Picker / Drive configuration, copy `config.example.js` to `config.js` and paste only the browser API key and OAuth Client ID. Never put an OAuth client secret in this static site.
