from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MediaFileResponse(BaseModel):
    id: str
    url: str
    originalName: str
    contentType: str
    sizeBytes: int


class OptimizeImageRequest(BaseModel):
    fileId: str = Field(min_length=1)
    variants: list[Literal["display", "thumb"]] = Field(
        default_factory=lambda: ["display"],
        min_length=1,
    )

    @model_validator(mode="after")
    def require_display_variant(self):
        if "display" not in self.variants:
            raise ValueError("variants must contain display and may include thumb")
        return self


class OptimizedImageResponse(BaseModel):
    imageId: str
    sourceFileId: str
    displayUrl: str
    thumbUrl: str | None
    variants: list[Literal["display", "thumb"]]
    width: int
    height: int
