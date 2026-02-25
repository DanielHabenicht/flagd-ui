pub mod db;
pub mod models;
pub mod service;

// WASM bindings – compiled only when targeting WebAssembly
#[cfg(target_arch = "wasm32")]
pub mod wasm;

// REST controller – compiled only for native targets
#[cfg(not(target_arch = "wasm32"))]
pub mod controller;
