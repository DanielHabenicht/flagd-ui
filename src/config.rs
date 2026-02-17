use clap::Parser;
use std::env;

/// Command-line arguments for the flagd-ui server
#[derive(Parser, Debug, Clone)]
#[command(name = "flagd-ui")]
#[command(about = "A web UI for managing feature flags in OpenFeature flagd service")]
pub struct CliArgs {
    /// Storage URI for feature flags
    ///
    /// Supported formats:
    /// - Local filesystem: file:///path/to/flags or /path/to/flags or ./flags
    /// - Azure Blob Storage connection string: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;Container=<container>
    #[arg(long, env = "STORAGE_URI")]
    pub storage_uri: Option<String>,

    /// HTTP server port
    #[arg(long, env = "SERVER_PORT", default_value = "3000")]
    pub port: u16,

    /// Directory for static files
    #[arg(long, env = "STATIC_DIR", default_value = "./public")]
    pub static_dir: String,

    /// Path to the flagd JSON schema file
    #[arg(
        long,
        env = "FLAGD_SCHEMA_FILE",
        default_value = "./schema/flagd-schema.json"
    )]
    pub schema_file_path: String,
}

/// Server configuration loaded from environment variables and CLI arguments
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// HTTP server port
    pub port: u16,
    /// Directory for static files
    pub static_dir: String,
    /// Storage URI for feature flags (supports file://, local paths, or Azure connection strings)
    pub storage_uri: String,
    /// Path to the flagd JSON schema file
    pub schema_file_path: String,
}

impl ServerConfig {
    /// Load configuration from CLI arguments and environment variables
    pub fn from_cli() -> Self {
        let args = CliArgs::parse();

        let storage_uri = args
            .storage_uri
            .or_else(|| env::var("FLAGS_DIR").ok())
            .unwrap_or_else(|| "./flags".to_string());

        Self {
            port: args.port,
            static_dir: args.static_dir,
            storage_uri,
            schema_file_path: args.schema_file_path,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            static_dir: "./public".to_string(),
            storage_uri: "./flags".to_string(),
            schema_file_path: "./schema/flagd-schema.json".to_string(),
        }
    }
}
