from typing import Literal

from pydantic import BaseModel, Field


PopupType = Literal["poster", "notice"]


class PopupCopy(BaseModel):
    """Stored / public notice copy — rich HTML body only."""

    body: str = ""


class PopupCopyInput(BaseModel):
    """Admin upsert may still send legacy plain `title` (folded into body)."""

    body: str = ""
    title: str = ""


class PopupResponse(BaseModel):
    id: str
    name: str
    type: PopupType
    enabled: bool
    sortOrder: int
    startsAt: str | None = None
    endsAt: str | None = None
    contentRevision: int
    imageId: str | None = None
    sourceFileId: str | None = None
    backgroundColor: str | None = None
    copies: dict[str, PopupCopy] = Field(default_factory=dict)


class PublishedPopupResponse(BaseModel):
    """Public home contract — no admin-only fields."""

    id: str
    type: PopupType
    sortOrder: int
    imageId: str | None = None
    backgroundColor: str | None = None
    copies: dict[str, PopupCopy] = Field(default_factory=dict)


class PopupUpsertRequest(BaseModel):
    name: str = ""
    type: PopupType
    enabled: bool = True
    sortOrder: int = 0
    startsAt: str | None = None
    endsAt: str | None = None
    imageId: str | None = None
    sourceFileId: str | None = None
    backgroundColor: str | None = None
    copies: dict[str, PopupCopyInput] = Field(default_factory=dict)


class PopupReorderRequest(BaseModel):
    orderedIds: list[str] = Field(min_length=1)
