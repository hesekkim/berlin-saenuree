from typing import Literal

from pydantic import BaseModel, Field, SecretStr


BackupKind = Literal["automatic", "manual", "pre_restore"]


class BackupSummary(BaseModel):
    id: str
    kind: BackupKind
    createdAt: str
    sizeBytes: int = Field(ge=0)
    isValid: bool


class BackupListResponse(BaseModel):
    backups: list[BackupSummary]
    maxBackups: int = Field(ge=1)


class ImportPreviewResponse(BaseModel):
    importId: str
    createdAt: str
    siteId: str
    fileCount: int = Field(ge=0)
    expandedSizeBytes: int = Field(ge=0)


class BackupPasswordRequest(BaseModel):
    password: SecretStr


class BackupRestoreResponse(BaseModel):
    restored: bool
    safetyBackupId: str
