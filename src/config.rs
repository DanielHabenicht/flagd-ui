use std::env;
use clap::Parser;

/// Command-line arguments for the flagd-ui server
#[derive(Parser, Debug, Clone)]
#[command(name = "flagd-ui")]
#[command(about = "A web UI for managing feature flags in OpenFeature flagd service")]
pub struct CliArgs {
    /// Storage URI for feature flags
    /// 
    /// Supported formats:
    /// - Local filesystem: file:///path/to/flags or /path/to/flags or ./flags
    /// - Azure Blob Storage URL: https://<account>.blob.core.windows.net/<container>
    /// - Azure connection string: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;Container=<container>
    /// - Azurite (local): http://127.0.0.1:10000/devstoreaccount1/<container>
    #[arg(long, env = "STORAGE_URI")]
    pub storage_uri: Option<String>,

    /// HTTP server port
    #[arg(long, env = "SERVER_PORT", default_value = "3000")]
    pub port: u16,

    /// Directory for static files
    #[arg(long, env = "STATIC_DIR", default_value = "./public")]
    pub static_dir: String,

    /// Path to the flagd JSON schema file
    #[arg(long, env = "FLAGD_SCHEMA_FILE", default_value = "./schema/flagd-schema.json")]
    pub schema_file_path: String,
}

/// Server configuration loaded from environment variables and CLI arguments
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// HTTP server port
    pub port: u16,
    /// Directory for static files
    pub static_dir: String,
    /// Storage URI for feature flags (supports file://, https://, http://)
    pub storage_uri: String,
    /// Path to the flagd JSON schema file
    pub schema_file_path: String,
}

impl ServerConfig {
    /// Load configuration from CLI arguments and environment variables
    pub fn from_cli() -> Self {
        let args = CliArgs::parse();
        
        let storage_uri = args.storage_uri
            .or_else(|| env::var("FLAGS_DIR").ok())
            .unwrap_or_else(|| "./flags".to_string());

        Self {
            port: args.port,
            static_dir: args.static_dir,
            storage_uri,
            schema_file_path: args.schema_file_path,
        }
    }

    /// Load configuration from environment variables with sensible defaults (legacy support)
    pub fn from_env() -> Self {
        let port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./public".to_string());

        let storage_uri = env::var("STORAGE_URI")
            .or_else(|_| env::var("FLAGS_DIR"))
            .unwrap_or_else(|_| "./flags".to_string());

        let schema_file_path = env::var("FLAGD_SCHEMA_FILE")
            .unwrap_or_else(|_| "./schema/flagd-schema.json".to_string());

        Self {
            port,
            static_dir,
            storage_uri,
            schema_file_path,
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
