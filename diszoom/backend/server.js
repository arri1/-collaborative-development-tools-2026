const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, passwordHash]
    );
    
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/servers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.* FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/servers/:serverId/channels', authenticateToken, async (req, res) => {
  try {
    const channels = await pool.query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY type, position',
      [req.params.serverId]
    );
    
    const textChannels = channels.rows.filter(c => c.type === 'text');
    const voiceChannels = channels.rows.filter(c => c.type === 'voice');
    
    res.json({ text: textChannels, voice: voiceChannels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/turn-credentials', authenticateToken, (req, res) => {
    const turnSecret = process.env.TURN_SECRET;
    const turnServer = process.env.TURN_SERVER;

    const username = Math.floor(Date.now() / 1000) + 3600; // Время истечения (1 час)
    const hmac = require('crypto').createHmac('sha1', turnSecret);
    hmac.update(username.toString());
    const password = hmac.digest('base64');
    
    res.json({
        urls: [
            `turn:${turnServer}`,
            `turns:${turnServer}`  // Для TLS если настроено
        ],
        username: username,
        credential: password
    });
});

app.get('/api/channels/:channelId/messages', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;

        const channelCheck = await pool.query(
            `SELECT c.*, s.id as server_id 
             FROM channels c
             JOIN servers s ON c.server_id = s.id
             JOIN server_members sm ON s.id = sm.server_id
             WHERE c.id = $1 AND sm.user_id = $2`,
            [channelId, req.user.id]
        );
        
        if (channelCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к этому каналу' });
        }

        const messages = await pool.query(
            `SELECT m.*, u.username, u.avatar_url 
             FROM messages m
             LEFT JOIN users u ON m.user_id = u.id
             WHERE m.channel_id = $1
             ORDER BY m.created_at ASC
             LIMIT 100`,
            [channelId]
        );
        
        res.json(messages.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/channels/:channelId/messages', authenticateToken, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Сообщение не может быть пустым' });
        }

        const channelCheck = await pool.query(
            `SELECT c.* FROM channels c
             JOIN servers s ON c.server_id = s.id
             JOIN server_members sm ON s.id = sm.server_id
             WHERE c.id = $1 AND sm.user_id = $2 AND c.type = 'text'`,
            [channelId, req.user.id]
        );
        
        if (channelCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к этому каналу' });
        }

        const result = await pool.query(
            `INSERT INTO messages (channel_id, user_id, content, created_at) 
             VALUES ($1, $2, $3, NOW()) 
             RETURNING *`,
            [channelId, req.user.id, content.trim()]
        );

        const messageWithUser = await pool.query(
            `SELECT m.*, u.username, u.avatar_url 
             FROM messages m
             LEFT JOIN users u ON m.user_id = u.id
             WHERE m.id = $1`,
            [result.rows[0].id]
        );
        
        res.json(messageWithUser.rows[0]);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    switch(data.type) {
      case 'join':
        clients.set(data.userId, ws);
        ws.userId = data.userId;
        ws.channelId = data.channelId;
        break;
        
      case 'offer':
      case 'answer':
      case 'candidate':

        const targetWs = clients.get(data.targetId);
        if (targetWs) {
          targetWs.send(JSON.stringify(data));
        }
        break;
    }
  });
  
  ws.on('close', () => {
    clients.delete(ws.userId);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
