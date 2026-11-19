from __future__ import annotations

import uuid

from core.config import settings
from core.json_store import JsonStoreCorruptError, read_json_store, write_json_store
from core.store_lock import STORE_LOCK
from models.cms import (
    ChurchMemberCreateRequest,
    ChurchMemberResponse,
    ChurchMemberUpdateRequest,
)
from pydantic import ValidationError


class ChurchMemberNotFoundError(LookupError):
    """A requested church member does not exist."""


def _load_members() -> list[dict]:
    path = settings.church_members_file
    payload = read_json_store(path)
    if payload is None:
        return []
    if not isinstance(payload, dict):
        raise JsonStoreCorruptError(path, "expected a JSON object")
    members = payload.get("members", [])
    if not isinstance(members, list):
        raise JsonStoreCorruptError(path, "'members' must be a list")
    try:
        return [
            ChurchMemberResponse.model_validate(member).model_dump(mode="json")
            for member in members
        ]
    except ValidationError as error:
        raise JsonStoreCorruptError(path, "invalid member record") from error


def list_church_members() -> list[dict]:
    with STORE_LOCK:
        members = _load_members()
    members.sort(key=lambda member: (member["name"].casefold(), member["id"]))
    return members


def create_church_member(request: ChurchMemberCreateRequest) -> dict:
    with STORE_LOCK:
        members = _load_members()
        member = ChurchMemberResponse(
            id=str(uuid.uuid4()),
            name=request.name,
            email=request.email,
            birthDate=request.birthDate,
            phone=request.phone,
        )
        members.append(member.model_dump(mode="json"))
        write_json_store(settings.church_members_file, {"members": members})
    return member.model_dump(mode="json")


def update_church_member(
    member_id: str,
    request: ChurchMemberUpdateRequest,
) -> dict:
    with STORE_LOCK:
        members = _load_members()
        member_index = next(
            (index for index, member in enumerate(members) if member["id"] == member_id),
            None,
        )
        if member_index is None:
            raise ChurchMemberNotFoundError(member_id)
        member = ChurchMemberResponse(
            id=member_id,
            name=request.name,
            email=request.email,
            birthDate=request.birthDate,
            phone=request.phone,
        )
        members[member_index] = member.model_dump(mode="json")
        write_json_store(settings.church_members_file, {"members": members})
    return member.model_dump(mode="json")


def delete_church_member(member_id: str) -> None:
    with STORE_LOCK:
        members = _load_members()
        remaining = [member for member in members if member["id"] != member_id]
        if len(remaining) == len(members):
            raise ChurchMemberNotFoundError(member_id)
        write_json_store(settings.church_members_file, {"members": remaining})
