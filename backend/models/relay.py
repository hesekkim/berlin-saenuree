from pydantic import BaseModel, Field, SecretStr


class RelaySessionUpsertRequest(BaseModel):
    listener_password: SecretStr = Field(min_length=8, max_length=128)


class RelaySessionPasswordRequest(BaseModel):
    listener_password: SecretStr = Field(min_length=8, max_length=128)


class RelaySessionResponse(BaseModel):
    session_id: str
    status: str
    listener_count: int = 0


class RelayListenerTokenResponse(BaseModel):
    listener_token: str
    expires_in_seconds: int
