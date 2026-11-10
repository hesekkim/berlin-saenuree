"""Page content revisions: optimistic locking, legacy file migration, language cascade."""

import json

import pytest
from fastapi.testclient import TestClient

from api.v1.endpoints.auth import require_page_editor
from core.config import settings
from main import app
from services import page_content_service
from services.media_refs import is_media_referenced
from services.page_content_service import PageContentConflictError

COPY_EN = {
    "yearMotto": "Hello",
    "bibleVerse": "",
    "bibleReference": "",
    "heroImages": [],
    "panoramaImageId": "",
    "panoramaSourceFileId": "",
    "youtubeVideoUrls": ["dQw4w9WgXcQ"],
}
COPY_KO = {**COPY_EN, "yearMotto": "안녕"}
SHARED_MEDIA = {
    "heroImages": [],
    "panoramaImageId": "",
    "panoramaSourceFileId": "",
    "youtubeVideoUrls": ["dQw4w9WgXcQ"],
}


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_root", str(tmp_path))
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    return tmp_path


def _page_path(slug: str = "home"):
    return settings.page_content_file(slug)


def _write_legacy(language_map: dict) -> None:
    path = _page_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(language_map), encoding="utf-8")


def test_missing_page_starts_at_revision_zero(isolated_data):
    document = page_content_service.get_page_document("home")

    assert document.revision == 0
    assert document.content == {}


def test_each_save_increments_the_revision(isolated_data):
    first = page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    second = page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=1)

    assert (first.revision, second.revision) == (1, 2)
    stored = json.loads(_page_path().read_text(encoding="utf-8"))
    assert stored == {
        "contentRevision": 2,
        "content": {
            "en": {
                "yearMotto": "Hello",
                "bibleVerse": "",
                "bibleReference": "",
            }
        },
        "sharedMedia": SHARED_MEDIA,
    }


def test_stale_revision_is_rejected_and_keeps_the_newer_save(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    page_content_service.save_page_content(
        "home", {"en": {**COPY_EN, "yearMotto": "Newer"}}, expected_revision=1
    )

    with pytest.raises(PageContentConflictError) as error:
        page_content_service.save_page_content("home", {"ko": COPY_KO}, expected_revision=1)

    assert error.value.current.revision == 2
    assert error.value.current.content["en"]["yearMotto"] == "Newer"
    assert page_content_service.get_page_content("home") == {
        "en": {**COPY_EN, "yearMotto": "Newer"}
    }


def test_legacy_language_map_is_read_as_revision_one(isolated_data):
    _write_legacy({"en": COPY_EN})

    document = page_content_service.get_page_document("home")

    assert document.revision == 1
    assert document.content == {"en": COPY_EN}


def test_legacy_file_is_rewritten_in_the_new_format_on_next_save(isolated_data):
    _write_legacy({"en": COPY_EN})

    saved = page_content_service.save_page_content(
        "home", {"en": COPY_EN, "ko": COPY_KO}, expected_revision=1
    )

    assert saved.revision == 2
    stored = json.loads(_page_path().read_text(encoding="utf-8"))
    assert stored == {
        "contentRevision": 2,
        "content": {
            "en": {
                "yearMotto": "Hello",
                "bibleVerse": "",
                "bibleReference": "",
            },
            "ko": {
                "yearMotto": "안녕",
                "bibleVerse": "",
                "bibleReference": "",
            },
        },
        "sharedMedia": SHARED_MEDIA,
    }


def test_legacy_home_video_url_is_migrated_to_a_video_list(isolated_data):
    legacy_copy = {
        key: value for key, value in COPY_EN.items() if key != "youtubeVideoUrls"
    }
    legacy_copy["youtubeVideoUrl"] = "https://youtu.be/dQw4w9WgXcQ"
    _write_legacy({"en": legacy_copy})

    document = page_content_service.get_page_document("home")

    assert document.content["en"]["youtubeVideoUrls"] == [
        "https://youtu.be/dQw4w9WgXcQ"
    ]


def test_stale_editor_against_a_legacy_file_is_rejected(isolated_data):
    _write_legacy({"en": COPY_EN})

    with pytest.raises(PageContentConflictError):
        page_content_service.save_page_content("home", {"ko": COPY_KO}, expected_revision=0)


def test_removing_a_language_bumps_the_revision(isolated_data):
    page_content_service.save_page_content(
        "home", {"en": COPY_EN, "ko": COPY_KO}, expected_revision=0
    )

    page_content_service.remove_language_from_all_pages("ko")

    document = page_content_service.get_page_document("home")
    assert document.revision == 2
    assert "ko" not in document.content


def test_removing_a_language_absent_from_a_page_keeps_its_revision(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)

    page_content_service.remove_language_from_all_pages("ko")

    assert page_content_service.get_page_document("home").revision == 1


def test_put_with_stale_revision_returns_409_with_current_content(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)
    app.dependency_overrides[require_page_editor] = lambda: {"email": "admin@example.com", "role": "site_admin"}
    client = TestClient(app)
    try:
        response = client.put(
            "/api/v1/pages/home",
            json={"contentRevision": 0, "content": {"ko": COPY_KO}},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    body = response.json()
    assert body["contentRevision"] == 1
    assert body["content"] == {"en": COPY_EN}


def test_put_requires_a_revision(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {"email": "admin@example.com", "role": "site_admin"}
    client = TestClient(app)
    try:
        response = client.put("/api/v1/pages/home", json={"content": {"en": COPY_EN}})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_put_accepts_home_content_fields(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {
        "email": "admin@example.com",
        "role": "site_admin",
    }
    client = TestClient(app)
    content = {
        "en": {
            "yearMotto": "Hope",
            "bibleVerse": "A verse",
            "bibleReference": "John 1:1",
        }
    }
    shared_media = {
        "heroImages": [
            {"imageId": "hero-image", "sourceFileId": "hero-file"}
        ],
        "panoramaImageId": "panorama-image",
        "panoramaSourceFileId": "panorama-file",
        "youtubeVideoUrls": ["https://youtu.be/dQw4w9WgXcQ"],
    }
    try:
        response = client.put(
            "/api/v1/pages/home",
            json={
                "contentRevision": 0,
                "content": content,
                "sharedMedia": shared_media,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["content"] == {
        "en": {**content["en"], **shared_media}
    }
    assert response.json()["sharedMedia"] == shared_media


def test_visit_content_round_trips_through_page_api(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {
        "email": "admin@example.com",
        "role": "site_admin",
    }
    client = TestClient(app)
    content = {
        "en": {
            "address": "Borsigstraße 5, 10115 Berlin",
            "services": [
                {
                    "id": "sunday-service",
                    "name": "Sunday Service",
                    "day": "Sunday",
                    "time": "11:30",
                    "place": "GROSSER SAAL",
                }
            ],
        }
    }
    try:
        response = client.put(
            "/api/v1/pages/visit",
            json={"contentRevision": 0, "content": content},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["contentRevision"] == 1
    assert response.json()["content"]["en"]["address"] == content["en"]["address"]
    assert response.json()["content"]["en"]["services"] == content["en"]["services"]


def test_put_preserves_non_home_page_fields(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {
        "email": "admin@example.com",
        "role": "site_admin",
    }
    client = TestClient(app)
    content = {
        "en": {
            "title": "Posts title",
            "subtitle": "Posts subtitle",
            "description": "Posts description",
        }
    }
    try:
        response = client.put(
            "/api/v1/pages/posts",
            json={"contentRevision": 0, "content": content},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["content"] == content


@pytest.mark.parametrize(
    "videos",
    [
        ["dQw4w9WgXcQ", "M7lc1UVf-VE", "aqz-KE-bpKQ", "invalid"],
        ["https://example.com/watch?v=dQw4w9WgXcQ"],
    ],
)
def test_put_rejects_invalid_home_video_selections(isolated_data, videos):
    app.dependency_overrides[require_page_editor] = lambda: {
        "email": "admin@example.com",
        "role": "site_admin",
    }
    client = TestClient(app)
    try:
        response = client.put(
            "/api/v1/pages/home",
            json={
                "contentRevision": 0,
                "content": {"en": {**COPY_EN, "youtubeVideoUrls": videos}},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_put_accepts_empty_video_list_for_an_unselected_language(isolated_data):
    app.dependency_overrides[require_page_editor] = lambda: {
        "email": "admin@example.com",
        "role": "site_admin",
    }
    client = TestClient(app)
    content = {
        "en": {"yearMotto": "", "bibleVerse": "", "bibleReference": ""},
        "ko": {"yearMotto": "한국어", "bibleVerse": "", "bibleReference": ""},
    }
    try:
        response = client.put(
            "/api/v1/pages/home",
            json={
                "contentRevision": 0,
                "content": content,
                "sharedMedia": {**SHARED_MEDIA, "youtubeVideoUrls": []},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["content"]["en"]["yearMotto"] == ""
    assert response.json()["content"]["ko"]["yearMotto"] == "한국어"
    assert response.json()["sharedMedia"]["youtubeVideoUrls"] == []


def test_get_exposes_the_revision(isolated_data):
    page_content_service.save_page_content("home", {"en": COPY_EN}, expected_revision=0)

    response = TestClient(app).get("/api/v1/pages/home")

    assert response.status_code == 200
    assert response.json()["contentRevision"] == 1


def test_home_fields_are_preserved_and_protect_referenced_media(isolated_data):
    copy = {
        **COPY_EN,
        "yearMotto": "Hope",
        "bibleVerse": "A verse",
        "bibleReference": "John 1:1",
        "heroImages": [
            {"imageId": "hero-image", "sourceFileId": "hero-file"}
        ],
        "panoramaImageId": "panorama-image",
        "panoramaSourceFileId": "panorama-file",
        "youtubeVideoUrls": ["https://youtu.be/dQw4w9WgXcQ"],
    }
    page_content_service.save_page_content("home", {"en": copy}, expected_revision=0)

    expected = {key: value for key, value in copy.items() if key != "yearMotto"}
    expected["yearMotto"] = "Hope"
    assert page_content_service.get_page_content("home") == {"en": expected}
    assert is_media_referenced("hero-image")
    assert is_media_referenced("hero-file")
    assert is_media_referenced("panorama-image")
    assert is_media_referenced("panorama-file")


def test_shared_home_media_is_persisted_once_for_all_languages(isolated_data):
    images = [{"imageId": "hero", "sourceFileId": "source"}]
    media = {
        "heroImages": images,
        "panoramaImageId": "panorama",
        "panoramaSourceFileId": "panorama-source",
        "youtubeVideoUrls": ["dQw4w9WgXcQ"],
    }
    page_content_service.save_page_content(
        "home",
        {
            "en": {**COPY_EN, "yearMotto": "English"},
            "ko": {**COPY_KO, "yearMotto": "한국어"},
        },
        expected_revision=0,
        shared_media=media,
    )

    stored = json.loads(_page_path().read_text(encoding="utf-8"))
    assert stored["content"] == {
        "en": {
            "yearMotto": "English",
            "bibleVerse": "",
            "bibleReference": "",
        },
        "ko": {
            "yearMotto": "한국어",
            "bibleVerse": "",
            "bibleReference": "",
        },
    }
    assert stored["sharedMedia"] == media
    assert page_content_service.get_page_content("home")["en"]["heroImages"] == images
    assert page_content_service.get_page_content("home")["ko"]["heroImages"] == images


def test_non_home_page_fields_are_preserved(isolated_data):
    content = {
        "en": {
            "title": "Posts title",
            "subtitle": "Posts subtitle",
            "description": "Posts description",
            "nested": {"enabled": True},
        }
    }

    page_content_service.save_page_content(
        "posts", content, expected_revision=0
    )

    assert page_content_service.get_page_content("posts") == content
    assert json.loads(_page_path("posts").read_text(encoding="utf-8"))["content"] == content


def test_legacy_hero_image_is_migrated_to_an_image_list(isolated_data):
    _write_legacy(
        {
            "en": {
                **{
                    key: value
                    for key, value in COPY_EN.items()
                    if key != "heroImages"
                },
                "heroImageId": "legacy-image",
                "heroSourceFileId": "legacy-file",
            }
        }
    )

    content = page_content_service.get_page_content("home")

    assert content["en"]["heroImages"] == [
        {"imageId": "legacy-image", "sourceFileId": "legacy-file"}
    ]
    assert is_media_referenced("legacy-image")
    assert is_media_referenced("legacy-file")


def test_replacing_home_images_schedules_unreferenced_media_cleanup(
    isolated_data, monkeypatch
):
    from services import media_refs

    cleanup_calls = []
    monkeypatch.setattr(
        media_refs,
        "cleanup_unused_media",
        lambda *, image_ids, file_ids: cleanup_calls.append(
            (set(image_ids), set(file_ids))
        ),
    )
    old_copy = {
        **COPY_EN,
        "heroImages": [
            {"imageId": "old-hero", "sourceFileId": "old-hero-file"},
            {"imageId": "old-hero-2", "sourceFileId": "old-hero-file-2"},
        ],
        "panoramaImageId": "old-panorama",
        "panoramaSourceFileId": "old-panorama-file",
    }
    new_copy = {
        **COPY_EN,
        "heroImages": [
            {"imageId": "new-hero", "sourceFileId": "new-hero-file"}
        ],
        "panoramaImageId": "new-panorama",
        "panoramaSourceFileId": "new-panorama-file",
    }

    page_content_service.save_page_content(
        "home", {"en": old_copy}, expected_revision=0
    )
    page_content_service.save_page_content(
        "home", {"en": new_copy}, expected_revision=1
    )

    assert cleanup_calls[-1] == (
        {"old-hero", "old-hero-2", "old-panorama"},
        {"old-hero-file", "old-hero-file-2", "old-panorama-file"},
    )
