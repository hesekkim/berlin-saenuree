from pydantic import BaseModel, Field


class BloggerCopy(BaseModel):
    title: str = ""
    body: str = ""


class BloggerResponse(BaseModel):
    id: str
    published: bool
    createdBy: str
    createdAt: str
    updatedAt: str
    contentRevision: int
    copies: dict[str, BloggerCopy] = Field(default_factory=dict)


class BloggerListResponse(BaseModel):
    items: list[BloggerResponse]
    total: int
    limit: int
    offset: int


class PublicBloggerResponse(BaseModel):
    id: str
    createdAt: str
    copies: dict[str, BloggerCopy] = Field(default_factory=dict)


class PublicBloggerListResponse(BaseModel):
    items: list[PublicBloggerResponse]
    total: int
    limit: int
    offset: int


class BloggerUpsertRequest(BaseModel):
    published: bool = True
    contentRevision: int | None = None
    copies: dict[str, BloggerCopy] = Field(default_factory=dict)


class BloggerDraftResponse(BaseModel):
    id: str
    sourceBloggerId: str | None = None
    sourceContentRevision: int | None = None
    published: bool
    createdBy: str
    createdAt: str
    updatedAt: str
    contentRevision: int
    copies: dict[str, BloggerCopy] = Field(default_factory=dict)


class BloggerDraftUpsertRequest(BaseModel):
    published: bool = True
    contentRevision: int | None = None
    sourceContentRevision: int | None = None
    copies: dict[str, BloggerCopy] = Field(default_factory=dict)
