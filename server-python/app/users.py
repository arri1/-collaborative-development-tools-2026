# server-python/app/users.py

class User:
    def __init__(self, user_id: str, name: str, ws=None):
        self.id = user_id
        self.name = name
        self.ws = ws  # WebSocket для сигналинга
        self.room_id = None

users = {}  # словарь всех пользователей: user_id -> User

def add_user(user_id: str, name: str, ws=None):
    user = User(user_id, name, ws)
    users[user_id] = user
    return user

def remove_user(user_id: str):
    if user_id in users:
        del users[user_id]

def get_user(user_id: str):
    return users.get(user_id)

def get_users_in_room(room_id: str):
    return [u for u in users.values() if u.room_id == room_id]