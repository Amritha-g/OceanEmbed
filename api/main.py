"""ASGI entrypoint: uvicorn api.main:app --host 0.0.0.0 --port 8000"""

from model.serve import app  # noqa: F401
