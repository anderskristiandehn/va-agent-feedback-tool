from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import annotations as ann
import billy_db
import db

app = FastAPI(title="Feedback Review Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/sessions")
def get_sessions():
    try:
        return db.fetch_all_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/meta")
def get_meta():
    try:
        return db.fetch_meta()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback")
def get_feedback():
    try:
        return db.fetch_feedback()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/orgs/refresh")
def refresh_orgs():
    try:
        cache = billy_db.refresh_cache()
        return {"ok": True, "count": len(cache)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/annotations")
def get_annotations():
    return ann.get_all()


class AnnotationBody(BaseModel):
    text: str


class StatusBody(BaseModel):
    status: str


@app.put("/api/annotations/session/{session_id}")
def put_session_annotation(session_id: str, body: AnnotationBody):
    try:
        ann.upsert_session(session_id, body.text)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/annotations/session/{session_id}")
def delete_session_annotation(session_id: str):
    try:
        ann.delete_session(session_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/annotations/message/{session_id}/{event_id}")
def put_message_annotation(session_id: str, event_id: str, body: AnnotationBody):
    try:
        ann.upsert_message(session_id, event_id, body.text)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/annotations/message/{session_id}/{event_id}")
def delete_message_annotation(session_id: str, event_id: str):
    try:
        ann.delete_message(session_id, event_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/annotations/session/{session_id}/status")
def put_session_status(session_id: str, body: StatusBody):
    if body.status not in ann.VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")
    try:
        ann.upsert_session_status(session_id, body.status)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/annotations/message/{session_id}/{event_id}/status")
def put_message_status(session_id: str, event_id: str, body: StatusBody):
    if body.status not in ann.VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")
    try:
        ann.upsert_message_status(session_id, event_id, body.status)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
