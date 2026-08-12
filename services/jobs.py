"""
Minimal background job runner used by every "start X" button in the app.
Each named job (fetch / style / score / captions) runs in a daemon thread;
the frontend polls a /status endpoint for progress instead of blocking on
the HTTP request that started it.
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Callable, Optional


class Job:
    def __init__(self, name: str):
        self.name = name
        self._lock = threading.Lock()
        self.status = "idle"  # idle | running | done | error
        self.progress: dict = {}
        self.error: Optional[str] = None
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "name": self.name,
                "status": self.status,
                "progress": dict(self.progress),
                "error": self.error,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
            }

    def set_progress(self, **kwargs) -> None:
        with self._lock:
            self.progress.update(kwargs)

    def is_running(self) -> bool:
        with self._lock:
            return self.status == "running"

    def start(self, target: Callable[["Job"], None]) -> bool:
        """Start target(job) in a background thread. Returns False if a run
        of this job is already in progress (never starts a second one)."""
        with self._lock:
            if self.status == "running":
                return False
            self.status = "running"
            self.progress = {}
            self.error = None
            self.started_at = time.time()
            self.finished_at = None

        def runner():
            try:
                target(self)
                with self._lock:
                    self.status = "done"
                    self.finished_at = time.time()
            except Exception as exc:  # noqa: BLE001 - surface every failure to the UI
                traceback.print_exc()
                with self._lock:
                    self.status = "error"
                    self.error = str(exc) or exc.__class__.__name__
                    self.finished_at = time.time()

        threading.Thread(target=runner, daemon=True).start()
        return True


# One job slot per pipeline step, shared process-wide.
JOBS = {
    "fetch": Job("fetch"),
    "style": Job("style"),
    "score": Job("score"),
    "captions": Job("captions"),
}
