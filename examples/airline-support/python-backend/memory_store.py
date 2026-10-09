"""In-memory ChatKit Store (abridged). Threads vanish on restart: swap for Postgres in production."""
from dataclasses import dataclass, field
from typing import Any

from chatkit.store import NotFoundError, Store
from chatkit.types import ThreadItem, ThreadMetadata


@dataclass
class _ThreadState:
    thread: ThreadMetadata
    items: list[ThreadItem] = field(default_factory=list)


class MemoryStore(Store[dict[str, Any]]):
    def __init__(self) -> None:
        self._threads: dict[str, _ThreadState] = {}

    async def load_thread(self, thread_id: str, context: dict[str, Any]) -> ThreadMetadata:
        state = self._threads.get(thread_id)
        if not state:
            raise NotFoundError(f"Thread {thread_id} not found")
        return state.thread.model_copy(deep=True)

    async def save_thread(self, thread: ThreadMetadata, context: dict[str, Any]) -> None:
        if thread.id in self._threads:
            self._threads[thread.id].thread = thread
        else:
            self._threads[thread.id] = _ThreadState(thread=thread)

    async def add_thread_item(self, thread_id: str, item: ThreadItem, context: dict[str, Any]) -> None:
        self._threads[thread_id].items.append(item.model_copy(deep=True))

    async def delete_thread(self, thread_id: str, context: dict[str, Any]) -> None:
        self._threads.pop(thread_id, None)

    # load_threads, load_thread_items, save_item, load_item, delete_thread_item and the
    # attachment methods follow the same dict-backed pattern upstream.
