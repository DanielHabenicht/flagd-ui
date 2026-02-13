mod config;
mod error;
mod handlers;
mod middleware;
mod openapi_doc;

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
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use config::ServerConfig;
use handlers::{
    health_check, readiness_check,
    init_app_state, list_flags, get_flag, create_flag, update_flag, delete_flag,
};
use openapi_doc::ApiDoc;

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

    // Initialize application state with schema validation
    let app_state = init_app_state(config.clone())
        .await
        .expect("Failed to initialize application state");

    tracing::info!("Schema validation initialized from: {}", config.schema_file_path);

    // Build the application router
    let app = create_router(&config, app_state);

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
fn create_router(config: &ServerConfig, app_state: handlers::api::AppState) -> Router {
    // API routes - prefix all with /api
    let api_routes = Router::new()
        // Flag management endpoints
        .route("/flags", get(list_flags).post(create_flag))
        .route("/flags/:name", get(get_flag).put(update_flag).delete(delete_flag))
        .with_state(app_state);

    // Main application router
    Router::new()
        // Health check endpoints
        .route("/health", get(health_check))
        .route("/ready", get(readiness_check))
        // Mount API routes under /api prefix
        .nest("/api", api_routes)
        // Swagger UI for interactive API documentation
        .merge(SwaggerUi::new("/swagger-ui").url("/api/openapi.json", ApiDoc::openapi()))
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
