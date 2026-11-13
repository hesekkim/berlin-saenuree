from typing import Literal

from pydantic import AliasChoices, BaseModel, Field


class PostImage(BaseModel):
    type: Literal["image"] = "image"
    imageId: str
    sourceFileId: str
    width: int
    height: int


class PostVideo(BaseModel):
    type: Literal["video"]
    fileId: str
    width: int
    height: int


PostMedia = PostImage | PostVideo


class PostCopy(BaseModel):
    """Caption rich HTML body (may be empty)."""

    body: str = ""


class PostResponse(BaseModel):
    id: str
    published: bool
    pinned: bool
    createdBy: str
    createdAt: str
    updatedAt: str
    contentRevision: int
    media: list[PostMedia]
    copies: dict[str, PostCopy] = Field(default_factory=dict)


class PostListResponse(BaseModel):
    items: list[PostResponse]
    total: int
    limit: int
    offset: int


class PublicPostImage(BaseModel):
    type: Literal["image"] = "image"
    imageId: str
    width: int
    height: int


class PublicPostVideo(BaseModel):
    type: Literal["video"]
    fileId: str
    width: int
    height: int


PublicPostMedia = PublicPostImage | PublicPostVideo


class PublicPostResponse(BaseModel):
    id: str
    createdAt: str
    media: list[PublicPostMedia]
    copies: dict[str, PostCopy] = Field(default_factory=dict)


class PublicPostListResponse(BaseModel):
    items: list[PublicPostResponse]
    total: int
    limit: int
    offset: int


class PostUpsertRequest(BaseModel):
    published: bool = True
    pinned: bool = False
    # Required on PUT (optimistic lock). Ignored on POST.
    contentRevision: int | None = None
    media: list[PostMedia] = Field(
        min_length=1,
        max_length=30,
        validation_alias=AliasChoices("media", "images"),
    )
    copies: dict[str, PostCopy] = Field(default_factory=dict)
