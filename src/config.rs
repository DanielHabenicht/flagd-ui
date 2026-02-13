use std::env;

/// Server configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// HTTP server port
    pub port: u16,
    /// Directory for static files
    pub static_dir: String,
}

impl ServerConfig {
    /// Load configuration from environment variables with sensible defaults
    pub fn from_env() -> Self {
        let port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./public".to_string());

        Self { port, static_dir }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            static_dir: "./public".to_string(),
        }
    }
}
