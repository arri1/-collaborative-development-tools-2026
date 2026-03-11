

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uuid
from app.users import add_user, remove_user, get_users_in_room, get_user
from app.rooms import get_or_create_room, remove_room_if_empty

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # разрешаем подключение с фронтенда
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    user_id = str(uuid.uuid4())
    await ws.send_json({"type": "assignId", "user_id": user_id})

    user = add_user(user_id, f"User-{user_id[:4]}", ws)

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            # пользователь присоединяется к комнате
            if msg_type == "join":
                room_id = data.get("room")
                room = get_or_create_room(room_id)
                room.add_user(user)

                # уведомляем всех в комнате
                users_in_room = [{"id": u.id, "name": u.name} for u in room.list_users()]
                for u in room.list_users():
                    if u.ws and u.ws.client_state == 1:  # подключен
                        await u.ws.send_json({
                            "type": "roomUpdate",
                            "room": room_id,
                            "users": users_in_room
                        })

            # пользователь покидает комнату
            elif msg_type == "leave":
                room_id = user.room_id
                if room_id:
                    room = get_or_create_room(room_id)
                    room.remove_user(user.id)
                    remove_room_if_empty(room_id)

            # relay для медиапакетов
            elif msg_type in ["offer", "answer", "ice"]:
                to_id = data.get("to")
                target = get_user(to_id)
                if target and target.ws:
                    await target.ws.send_json({**data, "from": user.id})

    except WebSocketDisconnect:
        # удаляем пользователя при отключении
        room_id = user.room_id
        remove_user(user.id)
        if room_id:
            room = get_or_create_room(room_id)
            room.remove_user(user.id)
            remove_room_if_empty(room_id)