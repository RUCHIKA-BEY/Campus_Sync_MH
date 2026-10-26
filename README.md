# CampusSync — Vanilla Frontend

CampusSync is a frontend-only conversion of the supplied React/TypeScript app into standard HTML5, CSS3, and vanilla JavaScript.

## Structure

- `index.html` — semantic page shell, all preserved page views, dashboards, modals, and navigation.
- `styles.css` — CSS variables, responsive layout system, components, cards, tables, timetable, and responsive breakpoints.
- `app.js` — browser-local state, navigation, event filters/search, registrations, ticket modal, notification drawer, and role switching.
- `public/assets/` — supplied CampusSync imagery, reused without replacement.
- `manus-routes.json` — static route manifest for the managed preview.

## Run locally

Serve the project root with any static server. For example:

```bash
python3 -m http.server 3000
```

The app intentionally has no backend, authentication, payment, or database dependency.
