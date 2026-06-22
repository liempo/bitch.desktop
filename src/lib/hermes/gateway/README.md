# Hermes gateway lane

This subfeature is the public renderer contract for Hermes JSON-RPC runtime traffic. It owns the `HermesGateway` subclass, upstream-compatible JSON-RPC client copy, Tauri WebSocket shim, runtime ports, connection-config helpers, and gateway registry ViewModel.

Renderer code should import `$lib/hermes/gateway`; legacy `$lib/gateway/*` compatibility paths have been removed.
