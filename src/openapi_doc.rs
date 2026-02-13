use utoipa::OpenApi;

/// OpenAPI documentation
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::handlers::api::flags::list_flags,
        crate::handlers::api::flags::get_flag,
        crate::handlers::api::flags::create_flag,
        crate::handlers::api::flags::update_flag,
        crate::handlers::api::flags::delete_flag,
    ),
    components(
        schemas(
            crate::handlers::api::CreateFlagRequest,
            crate::handlers::api::UpdateFlagRequest,
            crate::handlers::api::FlagDefinitionResponse,
            crate::handlers::api::ListFlagsResponse,
        )
    ),
    tags(
        (name = "flags", description = "Feature Flag Definition Management API")
    ),
    info(
        title = "Flagd UI API",
        version = "0.1.0",
        description = "API for managing feature flag definition files compatible with flagd",
        license(
            name = "MIT"
        )
    )
)]
pub struct ApiDoc;
