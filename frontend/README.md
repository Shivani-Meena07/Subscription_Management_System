# SubSight — Frontend

The frontend of **SubSight**, a subscription and billing management platform built to provide a centralized interface for monitoring subscriptions, managing billing information, and tracking payment activity.

## Tech Stack

- **React** — User interface development
- **Vite** — Frontend build tool and development server
- **JavaScript** — Application logic
- **Oxlint** — Code quality and linting

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Development Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [Oxlint Documentation](https://oxc.rs/)
- [React Compiler Installation](https://react.dev/learn/react-compiler/installation)

## React + Vite Configuration

The project uses the official Vite React integration:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) — Powered by [Oxc](https://oxc.rs).
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) — Powered by [SWC](https://swc.rs/).

The React Compiler is not enabled by default due to its impact on development and build performance. Refer to the [official installation guide](https://react.dev/learn/react-compiler/installation) for configuration details.
