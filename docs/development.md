# Windows development

## Prerequisites

- Windows 10/11 x64 for the current build target; Windows 11 is the primary QA
  target. This is not yet a tested public OS support promise.
- Node 22.18+ and pnpm 11.15.1 (the package-manager version in `package.json`).
- Rust 1.99+ using `x86_64-pc-windows-msvc`, with Cargo, rustfmt and Clippy.
- Microsoft C++ Build Tools, **Desktop development with C++**, x64/x86 MSVC tools
  and a Windows 10/11 SDK.
- Microsoft Edge WebView2 Runtime.
- Git, with your own identity configured if you want to commit.

Official installers: [Tauri prerequisite guide](https://v2.tauri.app/start/prerequisites/),
[Rust](https://rustup.rs/),
[C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
[WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

Restart the terminal and editor after native tool installation. Verify:

```powershell
node --version
pnpm.cmd --version
rustc --version
cargo --version
rustup show
```

If Rust is installed but absent from the current PowerShell PATH:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

This only adjusts the current session. The normal rustup installation adds its
bin directory to the user's PATH for future sessions. If native linking fails,
confirm the C++ workload/SDK in Visual Studio Installer. A missing `cl` in an
ordinary PowerShell session alone does not prove the workload is absent; Rust
discovers installed MSVC tools.

## Install and run

From the repository root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd desktop:dev
```

Use `.cmd` launchers if PowerShell execution policy blocks `pnpm.ps1`; no policy
change is needed. Tauri starts Vite on `127.0.0.1:1420` with strict port matching.
Stop another Aura development session before starting a new one. Do not expose
the development server to the network.

`pnpm.cmd dev` renders only the frontend for quick UI work. Native controls are
disabled and the status says preview. The separate settings view can be inspected
at `http://127.0.0.1:1420/?window=settings`. This does not test native transparency,
window management or ACL enforcement.

## Checks

| Command                  | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `pnpm.cmd typecheck`     | Strict application and tooling TypeScript        |
| `pnpm.cmd lint`          | ESLint, React hooks and refresh rules            |
| `pnpm.cmd format:check`  | Prettier verification                            |
| `pnpm.cmd format`        | Format supported frontend/config/docs files      |
| `pnpm.cmd build`         | TypeScript checks plus production Vite assets    |
| `pnpm.cmd native:format` | Rust formatting                                  |
| `pnpm.cmd native:check`  | Locked Rust dependency and compiler check        |
| `pnpm.cmd native:lint`   | Clippy with warnings treated as errors           |
| `pnpm.cmd native:test`   | Rust serialization/protocol tests                |
| `pnpm.cmd test:e2e`      | Browser shell, error handling and offline checks |
| `pnpm.cmd desktop:build` | Release executable and per-user NSIS installer   |

For the first browser test run, install its test browser:

```powershell
pnpm.cmd exec playwright install chromium
pnpm.cmd test:e2e
```

The native smoke test is opt-in and attaches to a local **debug** WebView2 instance.
See `tests/native.spec.ts` and the recorded procedure in `docs/verification.md`.
Remote debugging is a developer-only process environment option; it is not set
in production code or bundle configuration.

First native builds download Rust crates and may take several minutes. Both
package registries and installer tooling require internet during setup/build;
the installed application does not need it for foundation functionality. Keep
both lockfiles committed; use controlled dependency updates and rerun checks.

## Manual native acceptance

1. Launch on a patterned desktop and confirm visible background around the glass
   surface; vary opacity and confirm underlying content shows through.
2. Check there is no native title bar/border; drag only the custom title bar.
3. Minimize and recover from the taskbar. Enable and disable always-on-top with
   another normal window in front.
4. Open settings repeatedly: one settings window should exist. Close/reopen it.
5. Close the host while settings is open: all Aura windows should exit.
6. Repeat on light/dark wallpaper, 100/125/150/200% scale, mixed-DPI monitors,
   Remote Desktop and multiple supported WebView2/GPU configurations.

Do not mark native transparency passed from a browser screenshot alone. Distinguish
CSS alpha, actual native composition and desktop-layer behaviour in reports.
