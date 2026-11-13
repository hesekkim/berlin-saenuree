from fastapi.testclient import TestClient

from api.v1.endpoints import blogger, posts
from main import app


def test_public_posts_return_only_published_content_fields(monkeypatch):
    observed = {}

    def list_posts(**kwargs):
        observed.update(kwargs)
        return {
            "items": [
                {
                    "id": "post-1",
                    "published": True,
                    "pinned": True,
                    "createdBy": "writer@example.com",
                    "createdAt": "2026-01-02T03:04:05+00:00",
                    "updatedAt": "2026-01-03T03:04:05+00:00",
                    "contentRevision": 4,
                    "media": [
                        {
                            "type": "image",
                            "imageId": "image-1",
                            "sourceFileId": "private-file-id",
                            "width": 640,
                            "height": 480,
                        }
                    ],
                    "copies": {"en": {"body": "<p>Public caption</p>"}},
                }
            ],
            "total": 1,
            "limit": 30,
            "offset": 0,
        }

    monkeypatch.setattr(posts, "list_posts", list_posts)

    response = TestClient(app).get("/api/v1/posts")

    assert response.status_code == 200
    assert observed["published"] is True
    assert response.json() == {
        "items": [
            {
                "id": "post-1",
                "createdAt": "2026-01-02T03:04:05+00:00",
                "media": [
                    {
                        "type": "image",
                        "imageId": "image-1",
                        "width": 640,
                        "height": 480,
                    }
                ],
                "copies": {"en": {"body": "<p>Public caption</p>"}},
            }
        ],
        "total": 1,
        "limit": 30,
        "offset": 0,
    }


def test_public_blogger_returns_only_published_content_fields(monkeypatch):
    observed = {}

    def list_blogger(**kwargs):
        observed.update(kwargs)
        return {
            "items": [
                {
                    "id": "blog-1",
                    "published": True,
                    "createdBy": "writer@example.com",
                    "createdAt": "2026-01-02T03:04:05+00:00",
                    "updatedAt": "2026-01-03T03:04:05+00:00",
                    "contentRevision": 4,
                    "copies": {
                        "en": {"title": "Public story", "body": "<p>Text</p>"}
                    },
                }
            ],
            "total": 1,
            "limit": 30,
            "offset": 0,
        }

    monkeypatch.setattr(blogger, "list_blogger", list_blogger)

    response = TestClient(app).get("/api/v1/blogger")

    assert response.status_code == 200
    assert observed["published"] is True
    assert response.json() == {
        "items": [
            {
                "id": "blog-1",
                "createdAt": "2026-01-02T03:04:05+00:00",
                "copies": {
                    "en": {"title": "Public story", "body": "<p>Text</p>"}
                },
            }
        ],
        "total": 1,
        "limit": 30,
        "offset": 0,
    }


def test_public_blogger_item_hides_unpublished_item(monkeypatch):
    monkeypatch.setattr(
        blogger,
        "get_blogger",
        lambda _blogger_id: {
            "id": "draft-1",
            "published": False,
            "createdAt": "2026-01-02T03:04:05+00:00",
            "copies": {"en": {"title": "Draft", "body": "<p>Not public</p>"}},
        },
    )

    response = TestClient(app).get("/api/v1/blogger/draft-1")

    assert response.status_code == 404
    assert response.json()["detail"] == "Blogger not found"
