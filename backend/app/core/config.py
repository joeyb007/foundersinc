from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    project_name: str = "Founders Inc API"
    # Origins allowed to call this API from the browser (the Next.js frontend).
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
