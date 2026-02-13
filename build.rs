use std::{fs, path::PathBuf};
use utoipa::OpenApi;

#[path = "src/config.rs"]
mod config;
#[path = "src/error.rs"]
mod error;
#[path = "src/handlers/api/flags.rs"]
pub mod flags_impl;

mod handlers {
    pub mod api {
        pub use crate::flags_impl as flags;
        pub use crate::flags_impl::{
            CreateFlagRequest, FlagDefinitionResponse, ListFlagsResponse, UpdateFlagRequest,
        };
    }
}

#[path = "src/openapi_doc.rs"]
mod openapi_doc;

use openapi_doc::ApiDoc;

fn main() {
    println!("cargo:rerun-if-changed=src/openapi_doc.rs");
    println!("cargo:rerun-if-changed=src/handlers/api/flags.rs");

    let manifest_dir =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set"));
    let output_path = manifest_dir.join("ui/openapi.json");

    let openapi_json =
        serde_json::to_string_pretty(&ApiDoc::openapi()).expect("Failed to serialize OpenAPI spec");

    fs::write(&output_path, openapi_json).unwrap_or_else(|err| {
        panic!(
            "Failed to write OpenAPI spec to {}: {}",
            output_path.display(),
            err
        )
    });
}
