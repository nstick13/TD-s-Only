import json
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Embedded Combined HTML Frontend
HTML_CONTENT = """
<!DOCTYPE html>
<html>
<head>
  <title>Touchdown League</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
    .player-card { border: 1px solid #ccc; padding: 15px; border-radius: 8px; width: 250px; background: #fff; }
    .badge-out { color: red; font-weight: bold; }
    .badge-healthy { color: green; font-weight: bold; }
  </style>
</head>
<body>
  <h2>NFL Touchdown League</h2>
  <div class="player-card" data-player-id="101">
    <h3 class="player-name">Patrick Mahomes</h3>
    <p>Status: <span class="injury-badge badge-healthy">Healthy</span></p>
    <button class="draft-btn">Draft Player</button>
  </div>

  <script>
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "INJURY_UPDATE") {
        const card = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (!card) return;

        const badge = card.querySelector(".injury-badge");
        badge.textContent = data.detail ? `${data.status} (${data.detail})` : data.status;
        badge.className = `injury-badge badge-${data.status.toLowerCase()}`;

        const btn = card.querySelector(".draft-btn");
        btn.disabled = !data.draftable;
        btn.textContent = data.draftable ? "Draft Player" : "Ineligible";
      }
    };
  </script>
</body>
</html>
"""

@app.get("/")
async def get_dashboard():
    return HTMLResponse(HTML_CONTENT)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/injury/update")
async def update_injury(player_id: str, status: str, detail: str = ""):
    is_draftable = status.upper() not in ["OUT", "IR", "PUP"]
    payload = {
        "type": "INJURY_UPDATE",
        "playerId": player_id,
        "status": status,
        "detail": detail,
        "draftable": is_draftable
    }
    await manager.broadcast(payload)
    return {"status": "success", "data": payload}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)