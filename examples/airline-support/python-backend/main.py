"""FastAPI entry point: ChatKit endpoint plus state endpoints for the Agent View panel."""
import json
from os import environ

from chatkit.server import StreamingResult
from fastapi import Depends, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from airline_server import AirlineServer

app = FastAPI()
environ.setdefault("OPENAI_TRACING_DISABLED", "1")  # zero data retention orgs: no traces leave
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

chat_server = AirlineServer()


def get_server() -> AirlineServer:
    return chat_server


@app.post("/chatkit")
async def chatkit_endpoint(request: Request, server: AirlineServer = Depends(get_server)) -> Response:
    result = await server.process(await request.body(), {"request": request})
    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")
    return Response(content=result.json, media_type="application/json")


@app.get("/chatkit/state")
async def chatkit_state(thread_id: str = Query(...), server: AirlineServer = Depends(get_server)):
    return await server.snapshot(thread_id, {"request": None})


@app.get("/chatkit/state/stream")
async def chatkit_state_stream(thread_id: str = Query(...), server: AirlineServer = Depends(get_server)):
    queue = server.register_listener(thread_id)

    async def events():
        try:
            yield f"data: {json.dumps(await server.snapshot(thread_id, {'request': None}), default=str)}\n\n"
            while True:
                yield f"data: {await queue.get()}\n\n"
        finally:
            server.unregister_listener(thread_id, queue)

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}
