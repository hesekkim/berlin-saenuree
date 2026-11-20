from pydantic import BaseModel


class RelaySessionResponse(BaseModel):
    session_id: str
    status: str
    listener_count: int = 0


class RelayListenerTokenResponse(BaseModel):
    listener_token: str
    expires_in_seconds: int
