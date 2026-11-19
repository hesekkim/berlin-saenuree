from fastapi import APIRouter
from api.v1.endpoints import (
    auth,
    backups,
    blogger,
    church_members,
    cms_users,
    media_files,
    media_images,
    pages,
    popups,
    posts,
    site_settings,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    backups.router, prefix="/admin/backups", tags=["admin-backups"]
)
api_router.include_router(
    church_members.router, prefix="/admin/members", tags=["admin-members"]
)
api_router.include_router(pages.router, prefix="/pages", tags=["pages"])
api_router.include_router(
    site_settings.router, prefix="/site-settings", tags=["site-settings"]
)
api_router.include_router(
    cms_users.router, prefix="/cms-users", tags=["cms-users"]
)
api_router.include_router(
    media_files.router, prefix="/media", tags=["media"]
)
api_router.include_router(
    media_images.router, prefix="/media", tags=["media"]
)
api_router.include_router(popups.router, prefix="/popups", tags=["popups"])
api_router.include_router(posts.public_router, prefix="/posts", tags=["posts"])
api_router.include_router(
    blogger.public_router, prefix="/blogger", tags=["blogger"]
)
api_router.include_router(
    popups.admin_router, prefix="/admin/popups", tags=["admin-popups"]
)
api_router.include_router(
    posts.admin_router, prefix="/admin/posts", tags=["admin-posts"]
)
api_router.include_router(
    blogger.admin_router, prefix="/admin/blogger", tags=["admin-blogger"]
)
