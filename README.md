# Aura

A Windows desktop personalisation application built with Tauri 2, Rust, React
and TypeScript. Aura's foundation provides a transparent, frameless widget-host
window with a restrained dark glass identity and a separate settings placeholder.
This repository contains only the desktop application.

## Foundation scope

- Frameless, draggable host; minimize, quit and optional always-on-top controls.
- Reusable glass surfaces, text, icon buttons, controls and layout primitives.
- Session-only glass opacity; no background polling or network dependency.
- Typed Rust metadata command, protocol validation, structured errors and retry UI.
- Settings window created on demand and reused while open.
- Widget definition/instance contracts and an intentionally empty registry.
- Scoped Tauri capabilities, local content and restrictive content security policy.

Clock, CPU/RAM monitoring, music, notes, per-widget drag/resize, saved layouts,
startup, native wallpaper blur and desktop-icon-layer integration are **not
implemented**. The foundation is not a public production release.

## Quick start on Windows

Install Node **22.18+**, pnpm **11.15.1**, Rust **1.99+** with the
`x86_64-pc-windows-msvc` toolchain, Microsoft C++ Build Tools with **Desktop
development with C++** and a Windows SDK, and WebView2 Runtime. Restart the terminal
after installing tools.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd desktop:dev
```

Use `pnpm.cmd dev` for frontend-only inspection. The preview explicitly reports
that Rust is unavailable; native window controls are disabled. It is a development
view of the desktop UI, not a separate website.

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd format:check
pnpm.cmd build
pnpm.cmd native:format
pnpm.cmd native:check
pnpm.cmd native:lint
pnpm.cmd native:test
pnpm.cmd test:e2e
pnpm.cmd desktop:build
```

## Structure

```text
src/
  app/                    Window entry and future providers
  components/
    ui/                   Shared glass and control primitives
    settings/             Settings placeholder
    widgets/              Future widget components
  features/
    widget-engine/        Definition, instance, registry and renderer
    layouts/              Saved-layout contract
    themes/               Theme contract
    integrations/         Future native adapter boundary
  hooks/                  Native connection lifecycle
  lib/                    Typed Tauri adapter and error handling
  stores/                 State ownership notes
  styles/                 Design tokens and shared styles
  types/                  IPC contracts
src-tauri/
  src/
    commands/             Narrow IPC entry points
    services/             Native business logic
    models/               Serialized data and errors
    database/             Future SQLite boundary
  capabilities/           Explicit per-window permissions
  icons/                  Generated Windows/application assets
  tauri.conf.json         Window, CSP and Windows bundle configuration
docs/                     Architecture, development, integrations, releases
tests/                    Browser and optional native WebView smoke tests
public/                   Local Aura mark; no remote assets
```

React 19, TypeScript 5.9, Vite, Tailwind CSS 4 and Lucide React form the UI layer.
Rust uses Tauri and Serde; no optional native integration plugins are installed.
`pnpm-lock.yaml` and `src-tauri/Cargo.lock` pin the resolved dependencies.

Read [development](docs/development.md), [architecture](docs/architecture.md),
[native investigations](docs/native-integrations.md) and [releases](docs/releases.md).
See [foundation verification](docs/verification.md) for the actual checks and
known limitations on the development machine.
