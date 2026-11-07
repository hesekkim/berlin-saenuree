from pydantic import BaseModel, Field


class PostImage(BaseModel):
    imageId: str
    sourceFileId: str
    width: int
    height: int


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
    images: list[PostImage]
    copies: dict[str, PostCopy] = Field(default_factory=dict)


class PostListResponse(BaseModel):
    items: list[PostResponse]
    total: int
    limit: int
    offset: int


class PostUpsertRequest(BaseModel):
    published: bool = True
    pinned: bool = False
    # Required on PUT (optimistic lock). Ignored on POST.
    contentRevision: int | None = None
    images: list[PostImage] = Field(min_length=1, max_length=30)
    copies: dict[str, PostCopy] = Field(default_factory=dict)
