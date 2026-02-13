mod config;
mod error;
mod handlers;
mod middleware;

use axum::{
    routing::get,
    Router,
};
use tower_http::{
    services::ServeDir,
    trace::TraceLayer,
    compression::CompressionLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::ServerConfig;
use handlers::{health_check, readiness_check, example_endpoint};

#[tokio::main]
async fn main() {
    // Initialize tracing for structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = ServerConfig::from_env();
    let addr = format!("0.0.0.0:{}", config.port);

    tracing::info!("Starting server with config: {:?}", config);

    // Build the application router
    let app = create_router(&config);

    // Create TCP listener
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");

    tracing::info!("Server listening on {}", addr);

    // Start the server
    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}

/// Create the Axum router with all routes and middleware
fn create_router(config: &ServerConfig) -> Router {
    // API routes - prefix all with /api
    let api_routes = Router::new()
        .route("/example", get(example_endpoint));

    // Main application router
    Router::new()
        // Health check endpoints
        .route("/health", get(health_check))
        .route("/ready", get(readiness_check))
        // Mount API routes under /api prefix
        .nest("/api", api_routes)
        // Serve static files from the public directory
        // This will also fallback to index.html for SPA routing
        .nest_service(
            "/",
            ServeDir::new(&config.static_dir)
                .not_found_service(ServeDir::new(&config.static_dir).append_index_html_on_directories(true))
        )
        // Add middleware stack
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
}
