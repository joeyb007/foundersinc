from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by the frontend to confirm connectivity."""
    return {"status": "ok"}


@router.get("/hello")
def hello() -> dict[str, str]:
    """Sample endpoint the frontend renders on its home page."""
    return {"message": "Hello from FastAPI 👋"}
