from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    # `extra="ignore"`: .env also carries credentials read straight from
    # os.environ (ANTHROPIC_API_KEY, TARGET_REPO, CONVEX_URL, CALLBACK_SECRET).
    # They are not app settings, and without this they'd fail validation here.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    project_name: str = "Founders Inc API"
    # Origins allowed to call this API from the browser (the Next.js frontend).
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
