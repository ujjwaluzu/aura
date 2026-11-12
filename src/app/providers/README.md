# App providers

Reserved for providers shared by an individual window. No global provider is
needed yet. Each Tauri window has its own React root and memory; do not rely on
React context to synchronize settings between windows.
