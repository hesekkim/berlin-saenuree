"""Manually purge trash items that exceeded the configured retention period.

The app runs the same purge on its own schedule (see services/maintenance_service.py).
This script is for one-off runs, e.g. `python -m scripts.purge_expired_trash` from `backend/`.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.blogger_trash_service import purge_expired_trash as purge_expired_blogger_trash  # noqa: E402
from services.posts_trash_service import purge_expired_trash  # noqa: E402


if __name__ == "__main__":
    purge_expired_trash()
    purge_expired_blogger_trash()
