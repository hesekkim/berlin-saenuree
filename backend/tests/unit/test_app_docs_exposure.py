from core.config import settings
from main import create_application


def test_api_docs_are_hidden_outside_debug(monkeypatch):
    monkeypatch.setattr(settings, "debug", False)

    application = create_application()

    assert application.docs_url is None
    assert application.redoc_url is None
    assert application.openapi_url is None


def test_api_docs_are_served_in_debug(monkeypatch):
    monkeypatch.setattr(settings, "debug", True)

    application = create_application()

    assert application.docs_url == "/docs"
    assert application.redoc_url == "/redoc"
    assert application.openapi_url == "/openapi.json"
