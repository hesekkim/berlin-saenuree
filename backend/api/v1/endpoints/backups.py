import asyncio
import threading

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from api.v1.endpoints.auth import get_current_site_admin
from models.backups import (
    BackupListResponse,
    BackupPasswordRequest,
    BackupRestoreResponse,
    BackupSummary,
    ImportPreviewResponse,
)
from services import backups_service

router = APIRouter()


def _http_error(error: backups_service.BackupError) -> HTTPException:
    if isinstance(error, backups_service.BackupPasswordNotConfiguredError):
        return HTTPException(status_code=503, detail=str(error))
    if isinstance(error, backups_service.BackupPasswordError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, backups_service.BackupNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=400, detail=str(error))


@router.get("", response_model=BackupListResponse)
async def get_backups(_email: str = Depends(get_current_site_admin)):
    try:
        return await run_in_threadpool(backups_service.list_backups)
    except backups_service.BackupError as error:
        raise _http_error(error) from error


@router.post("", response_model=BackupSummary)
async def post_backup(
    request: Request,
    _email: str = Depends(get_current_site_admin),
):
    cancel_event = threading.Event()
    backup_task = asyncio.create_task(
        run_in_threadpool(backups_service.create_backup, "manual", cancel_event)
    )
    try:
        while not backup_task.done():
            if await request.is_disconnected():
                cancel_event.set()
                break
            await asyncio.sleep(0.1)
        return await asyncio.shield(backup_task)
    except backups_service.BackupCancelledError as error:
        raise HTTPException(status_code=499, detail=str(error)) from error
    except asyncio.CancelledError:
        cancel_event.set()
        try:
            await asyncio.shield(backup_task)
        except (asyncio.CancelledError, backups_service.BackupCancelledError):
            pass
        raise
    except backups_service.BackupError as error:
        raise _http_error(error) from error


@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: str,
    _email: str = Depends(get_current_site_admin),
):
    try:
        path = await run_in_threadpool(backups_service.get_backup_file, backup_id)
    except backups_service.BackupError as error:
        raise _http_error(error) from error
    return FileResponse(
        path=path,
        media_type="application/zip",
        filename=path.name,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.post("/import", response_model=ImportPreviewResponse)
async def upload_backup(
    request: Request,
    file: UploadFile = File(...),
    _email: str = Depends(get_current_site_admin),
):
    cancel_event = threading.Event()
    import_task = asyncio.create_task(
        run_in_threadpool(backups_service.stage_import, file.file, cancel_event)
    )
    try:
        while not import_task.done():
            if await request.is_disconnected():
                cancel_event.set()
                break
            await asyncio.sleep(0.1)
        return await asyncio.shield(import_task)
    except backups_service.BackupCancelledError as error:
        raise HTTPException(status_code=499, detail=str(error)) from error
    except asyncio.CancelledError:
        cancel_event.set()
        try:
            await asyncio.shield(import_task)
        except (asyncio.CancelledError, backups_service.BackupCancelledError):
            pass
        raise
    except backups_service.BackupError as error:
        raise _http_error(error) from error
    finally:
        await file.close()


@router.post("/{backup_id}/restore", response_model=BackupRestoreResponse)
async def restore_backup(
    backup_id: str,
    request: BackupPasswordRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        return await run_in_threadpool(
            backups_service.restore_backup,
            backup_id,
            request.password.get_secret_value(),
        )
    except backups_service.BackupError as error:
        raise _http_error(error) from error


@router.post("/import/{import_id}/restore", response_model=BackupRestoreResponse)
async def restore_import(
    import_id: str,
    request: BackupPasswordRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        return await run_in_threadpool(
            backups_service.restore_import,
            import_id,
            request.password.get_secret_value(),
        )
    except backups_service.BackupError as error:
        raise _http_error(error) from error


@router.delete("/{backup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backup(
    backup_id: str,
    request: BackupPasswordRequest,
    _email: str = Depends(get_current_site_admin),
):
    try:
        await run_in_threadpool(
            backups_service.delete_backup,
            backup_id,
            request.password.get_secret_value(),
        )
    except backups_service.BackupError as error:
        raise _http_error(error) from error
