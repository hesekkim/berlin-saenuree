import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import uvicorn
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from core.config import MIN_JWT_SECRET_LENGTH, settings
from core.json_store import JsonStoreCorruptError
from services.rich_text import RichHtmlTooLongError
from services.cms_users_service import migrate_site_admin_preferences
from services.maintenance_service import maintenance_loop
from api.v1.api import api_router
from middleware.body_size_limit import BodySizeLimitMiddleware
from middleware.rate_limiter import RateLimitMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


def _validate_security_settings() -> None:
    if settings.trust_proxy_headers is not None and settings.trusted_proxy_hops is None:
        logger.warning(
            "APP_TRUST_PROXY_HEADERS is deprecated. Set APP_TRUSTED_PROXY_HOPS explicitly "
            "(1 behind a proxy, 0 when served directly)."
        )
    if settings.has_weak_jwt_secret:
        message = (
            "APP_JWT_SECRET_KEY is missing or too weak. "
            f"Set a random value of at least {MIN_JWT_SECRET_LENGTH} characters "
            "unique to this site before deploying."
        )
        if settings.debug:
            logger.warning(message)
        else:
            raise RuntimeError(message)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_security_settings()
    migrate_site_admin_preferences()
    maintenance_task = (
        asyncio.create_task(maintenance_loop()) if settings.maintenance_enabled else None
    )
    logger.info("Application startup")
    yield
    if maintenance_task is not None:
        maintenance_task.cancel()
        with suppress(asyncio.CancelledError):
            await maintenance_task
    logger.info("Application shutdown")


async def _handle_rich_html_too_long(
    request: Request, error: RichHtmlTooLongError
) -> JSONResponse:
    logger.info("%s %s rejected: %s", request.method, request.url.path, error)
    return JSONResponse(status_code=400, content={"detail": str(error)})


async def _handle_corrupt_json_store(
    request: Request, error: JsonStoreCorruptError
) -> JSONResponse:
    logger.error("%s %s failed: %s", request.method, request.url.path, error)
    return JSONResponse(
        status_code=503,
        content={"detail": "Data store is temporarily unavailable"},
    )


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )

    # Added first so it is innermost: its 413 still passes through CORS and rate limiting.
    application.add_middleware(BodySizeLimitMiddleware)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Auth-Token"],
    )

    application.add_middleware(
        RateLimitMiddleware,
        debug=settings.debug,
    )

    application.add_exception_handler(
        JsonStoreCorruptError, _handle_corrupt_json_store
    )
    application.add_exception_handler(
        RichHtmlTooLongError, _handle_rich_html_too_long
    )
    application.include_router(api_router, prefix=f"/api/{settings.api_version}")

    return application


app = create_application()


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "app_name": settings.app_name,
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
