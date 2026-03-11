# server-python/app/rooms.py

from typing import Dict
from app.users import User

class Room:
    def __init__(self, room_id: str):
        self.id = room_id
        self.users: Dict[str, User] = {}

    def add_user(self, user: User):
        self.users[user.id] = user
        user.room_id = self.id

    def remove_user(self, user_id: str):
        if user_id in self.users:
            self.users[user_id].room_id = None
            del self.users[user_id]

    def list_users(self):
        return list(self.users.values())


rooms: Dict[str, Room] = {}

def get_or_create_room(room_id: str):
    if room_id not in rooms:
        rooms[room_id] = Room(room_id)
    return rooms[room_id]

def remove_room_if_empty(room_id: str):
    room = rooms.get(room_id)
    if room and len(room.users) == 0:
        del rooms[room_id]