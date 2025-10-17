"""FastAPI routes for the Workspace Provisioning Service."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..services.state_manager import WorkspaceStateManager

router = APIRouter()


def get_state_manager(request: Request) -> WorkspaceStateManager:
    manager = getattr(request.app.state, "state_manager", None)
    if manager is None:
        raise RuntimeError("WorkspaceStateManager dependency not configured")
    return manager


@router.get("/workspaces/{permit_id}/status")
def workspace_status(
    permit_id: str,
    state_manager: WorkspaceStateManager = Depends(get_state_manager),
) -> dict:
    status_value = state_manager.get_status(permit_id)
    if status_value is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return {"status": status_value}


@router.get("/workspaces/{permit_id}/connection")
def workspace_connection(
    permit_id: str,
    state_manager: WorkspaceStateManager = Depends(get_state_manager),
) -> dict:
    connection = state_manager.get_connection_details(permit_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection details unavailable")
    return {"connection": connection}


__all__ = ["router"]
