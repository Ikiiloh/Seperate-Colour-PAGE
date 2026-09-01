import os
import time
import shutil
import logging

logger = logging.getLogger("cleanup")

def cleanup_old_sessions(sessions_dir: str, max_age_seconds: int = 1800):
    """
    Deletes session folders older than max_age_seconds (default: 30 minutes).
    """
    if not os.path.exists(sessions_dir):
        return

    now = time.time()
    for item in os.listdir(sessions_dir):
        session_path = os.path.join(sessions_dir, item)
        if os.path.isdir(session_path):
            try:
                folder_age = now - os.path.getmtime(session_path)
                if folder_age > max_age_seconds:
                    shutil.rmtree(session_path, ignore_errors=True)
                    logger.info(f"Cleaned up expired session directory: {item}")
            except Exception as e:
                logger.error(f"Error cleaning session {item}: {e}")
