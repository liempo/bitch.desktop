# Hermes gateway subfeature

This subfeature is the public renderer contract for Hermes JSON-RPC runtime traffic. It currently re-exports `$lib/gateway` for compatibility.

## Ownership

- The upstream-compatible `JsonRpcGatewayClient` copy.
- The local `HermesGateway` subclass.
- The Tauri WebSocket shim that keeps session-token-sensitive gateway setup behind Rust.

Do not place dashboard REST helpers or monitoring/Beszel calls here. Gateway runtime traffic is separate from Hermes dashboard REST, even when both ultimately cross the Tauri bridge.
