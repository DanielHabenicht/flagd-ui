use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

#[derive(Serialize)]
struct ApiResponse {
    message: String,
    data: Option<String>,
}

/// GET /api/example - Placeholder API endpoint
///
/// This is a placeholder endpoint demonstrating the API structure.
/// Replace this with your custom backend logic as needed.
pub async fn example_endpoint() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse {
            message: "This is a placeholder API endpoint".to_string(),
            data: Some("You can implement your custom logic here".to_string()),
        }),
    )
}
