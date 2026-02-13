use std::env;

/// Server configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// HTTP server port
    pub port: u16,
    /// Directory for static files
    pub static_dir: String,
    /// Directory for feature flag definition files
    pub flags_dir: String,
    /// Path to the flagd JSON schema file
    pub schema_file_path: String,
}

impl ServerConfig {
    /// Load configuration from environment variables with sensible defaults
    pub fn from_env() -> Self {
        let port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./public".to_string());

        let flags_dir = env::var("FLAGS_DIR").unwrap_or_else(|_| "./flags".to_string());

        let schema_file_path = env::var("FLAGD_SCHEMA_FILE")
            .unwrap_or_else(|_| "./schema/flagd-schema.json".to_string());

        Self {
            port,
            static_dir,
            flags_dir,
            schema_file_path,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            static_dir: "./public".to_string(),
            flags_dir: "./flags".to_string(),
            schema_file_path: "./schema/flagd-schema.json".to_string(),
        }
    }
}
