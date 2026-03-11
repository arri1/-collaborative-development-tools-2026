(function() {

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });

    document.addEventListener('keydown', function(e) {

        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }

        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }

        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }

        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }
    });

    let devtools = {
        open: false,
        orientation: null
    };

    const checkDevTools = function() {
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;
        
        if (widthThreshold || heightThreshold) {
            if (!devtools.open) {
                devtools.open = true;
                document.body.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #1a1a1a; color: #fff; font-size: 24px;">Инструменты разработчика отключены</div>';
            }
        } else {
            devtools.open = false;
        }
    };

    setInterval(checkDevTools, 1000);
})();

const app = document.getElementById('app');

let localStream;
let peerConnections = {};
let currentUser = null;
let wsConnection = null;

const token = localStorage.getItem('token');
if (!token) {
    renderLogin();
} else {

    fetch('/api/verify', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (res.ok) {
            return res.json();
        } else {
            throw new Error('Token invalid');
        }
    })
    .then(user => {
        currentUser = user;
        renderMainApp();
    })
    .catch(() => {
        localStorage.removeItem('token');
        renderLogin();
    });
}

function renderLogin() {
    app.innerHTML = `
        <div class="login-container">
            <div class="login-box">
                <h2>Вход в DisZoom</h2>
                <input type="text" id="username" placeholder="Логин">
                <input type="password" id="password" placeholder="Пароль">
                <button onclick="window.login()">Войти</button>
                <p style="text-align: center; margin-top: 16px; color: #949ba4;">
                    Нет аккаунта? <a href="#" onclick="window.showRegister()" style="color: #5865f2;">Регистрация</a>
                </p>
            </div>
        </div>
    `;
}

window.showRegister = function() {
    app.innerHTML = `
        <div class="login-container">
            <div class="login-box">
                <h2>Регистрация в DisZoom</h2>
                <input type="text" id="reg-username" placeholder="Логин">
                <input type="email" id="reg-email" placeholder="Email">
                <input type="password" id="reg-password" placeholder="Пароль">
                <input type="password" id="reg-confirm-password" placeholder="Подтвердите пароль">
                <button onclick="window.register()">Зарегистрироваться</button>
                <p style="text-align: center; margin-top: 16px; color: #949ba4;">
                    Уже есть аккаунт? <a href="#" onclick="window.renderLogin()" style="color: #5865f2;">Войти</a>
                </p>
            </div>
        </div>
    `;
}

window.login = function() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        alert('Заполните все поля');
        return;
    }
    
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.token) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            renderMainApp();
        } else {
            alert('Ошибка входа: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(err => {
        alert('Ошибка соединения с сервером');
        console.error(err);
    });
}

window.register = function() {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    
    if (!username || !email || !password || !confirmPassword) {
        alert('Заполните все поля');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        alert('Пароль должен быть минимум 6 символов');
        return;
    }
    
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.token) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            renderMainApp();
        } else {
            alert('Ошибка регистрации: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(err => {
        alert('Ошибка соединения с сервером');
        console.error(err);
    });
}

window.renderLogin = renderLogin;

function renderMainApp() {
    app.innerHTML = `
        <div class="app">
            <div class="servers-sidebar" id="servers-list"></div>
            <div class="channels-sidebar">
                <div class="channels-header" id="current-server-name">Выберите сервер</div>
                <div class="channels-list" id="channels-list"></div>
            </div>
            <div class="main-content">
                <div class="chat-header" id="current-channel"># общий</div>
                <div class="messages-container" id="messages-container"></div>
                <div class="message-input" id="message-input-container" style="display: none;">
                    <input type="text" placeholder="Сообщение" id="message-input" onkeypress="window.handleMessageKeyPress(event)">
                </div>
                <div class="voice-panel" id="voice-panel">
                    <div class="video-grid" id="video-grid"></div>
                    <div class="voice-controls">
                        <button class="control-btn" onclick="window.toggleMic()">🎤</button>
                        <button class="control-btn" onclick="window.toggleCamera()">📹</button>
                        <button class="control-btn" onclick="window.shareScreen()">🖥️</button>
                        <button class="control-btn danger" onclick="window.leaveVoice()">📞</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    loadServers();
    initWebSocket();
}

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsConnection = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    wsConnection.onopen = () => {
        console.log('WebSocket connected');
        if (currentUser) {
            wsConnection.send(JSON.stringify({
                type: 'join',
                userId: currentUser.id
            }));
        }
    };
    
    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(initWebSocket, 3000);
    };
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'offer':
        case 'answer':
        case 'candidate':
            handleWebRTCSignal(data);
            break;
    }
}

function loadServers() {
    fetch('/api/servers', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    .then(res => res.json())
    .then(servers => {
        const serversList = document.getElementById('servers-list');
        serversList.innerHTML = '';
        servers.forEach(server => {
            const div = document.createElement('div');
            div.className = 'server-icon';
            div.textContent = server.name.charAt(0).toUpperCase();
            div.onclick = () => loadChannels(server.id, server.name);
            serversList.appendChild(div);
        });

        if (servers.length > 0) {
            loadChannels(servers[0].id, servers[0].name);
        }
    })
    .catch(err => {
        console.error('Error loading servers:', err);
    });
}

function loadChannels(serverId, serverName) {
    document.getElementById('current-server-name').textContent = serverName;
    
    fetch(`/api/servers/${serverId}/channels`, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    .then(res => res.json())
    .then(channels => {
        const channelsList = document.getElementById('channels-list');
        channelsList.innerHTML = '<div class="channel-category">Текстовые каналы</div>';
        
        if (channels.text && channels.text.length > 0) {
            channels.text.forEach(channel => {
                const div = document.createElement('div');
                div.className = 'channel-item text';
                div.textContent = ' ' + channel.name;
                div.onclick = () => joinTextChannel(channel.id, channel.name);
                channelsList.appendChild(div);
            });
        }
        
        channelsList.innerHTML += '<div class="channel-category">Голосовые каналы</div>';
        
        if (channels.voice && channels.voice.length > 0) {
            channels.voice.forEach(channel => {
                const div = document.createElement('div');
                div.className = 'channel-item voice';
                div.textContent = ' ' + channel.name;
                div.onclick = () => joinVoiceChannel(channel.id, channel.name);
                channelsList.appendChild(div);
            });
        }
    })
    .catch(err => {
        console.error('Error loading channels:', err);
    });
}

function joinTextChannel(channelId, channelName) {
    console.log('Joining text channel:', channelId, channelName);
    document.getElementById('current-channel').textContent = '# ' + channelName;
    document.getElementById('voice-panel').classList.remove('active');
    document.getElementById('messages-container').style.display = 'block';
    document.getElementById('message-input-container').style.display = 'block';
    document.getElementById('message-input').value = ''; // Очищаем поле ввода
    loadMessages(channelId);
}

function joinVoiceChannel(channelId, channelName) {
    document.getElementById('current-channel').textContent = '🔊 ' + channelName;
    document.getElementById('messages-container').style.display = 'none';
    document.getElementById('message-input-container').style.display = 'none';
    document.getElementById('voice-panel').classList.add('active');
    initWebRTC(channelId);
}

let currentChannelId = null;

function loadMessages(channelId) {
    currentChannelId = channelId;
    console.log('Loading messages for channel:', channelId);
    
    fetch(`/api/channels/${channelId}/messages`, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error('Failed to load messages');
        }
        return res.json();
    })
    .then(messages => {
        console.log('Messages received:', messages);
        const container = document.getElementById('messages-container');
        container.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #949ba4; padding: 20px;">Нет сообщений. Напишите первое сообщение!</div>';
            return;
        }
        
        messages.forEach(msg => {
            const messageEl = createMessageElement(msg);
            container.appendChild(messageEl);
        });

        container.scrollTop = container.scrollHeight;
    })
    .catch(err => {
        console.error('Error loading messages:', err);
        document.getElementById('messages-container').innerHTML = '<div style="color: #ff4444; text-align: center; padding: 20px;">Ошибка загрузки сообщений</div>';
    });
}

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message';

    const messageDate = new Date(message.created_at);
    const timeString = messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    div.innerHTML = `
        <div class="message-avatar" style="background: ${stringToColor(message.username || 'User')};"></div>
        <div class="message-content">
            <div class="message-author">
                ${message.username || 'Пользователь'} 
                <span style="color: #949ba4; font-size: 0.8rem; margin-left: 8px;">${timeString}</span>
            </div>
            <div class="message-text">${escapeHtml(message.content)}</div>
        </div>
    `;
    return div;
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content || !currentChannelId) return;
    
    console.log('Sending message to channel:', currentChannelId, 'content:', content);
    
    fetch(`/api/channels/${currentChannelId}/messages`, {
        method: 'POST',
        headers: { 
            'Authorization': 'Bearer ' + localStorage.getItem('token'),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
    })
    .then(res => {
        if (!res.ok) {
            throw new Error('Failed to send message');
        }
        return res.json();
    })
    .then(message => {
        console.log('Message sent:', message);
        input.value = '';

        const container = document.getElementById('messages-container');
        const messageEl = createMessageElement(message);
        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;
    })
    .catch(err => {
        console.error('Error sending message:', err);
        alert('Не удалось отправить сообщение');
    });
}

async function getTurnCredentials() {
    try {
        const response = await fetch('/api/turn-credentials', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });
        return await response.json();
    } catch (error) {
        console.error('Error getting TURN credentials:', error);
        return null;
    }
}

async function initWebRTC(channelId) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: true 
        });
        
        const localVideo = document.createElement('video');
        localVideo.srcObject = localStream;
        localVideo.autoplay = true;
        localVideo.muted = true;
        localVideo.playsInline = true;
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.appendChild(localVideo);
        
        const nameTag = document.createElement('div');
        nameTag.className = 'participant-name';
        nameTag.textContent = currentUser.username + ' (Вы)';
        videoContainer.appendChild(nameTag);
        
        document.getElementById('video-grid').appendChild(videoContainer);
        
        const turnConfig = await getTurnCredentials();
        
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        if (turnConfig) {
            configuration.iceServers.push({
                urls: turnConfig.urls,
                username: turnConfig.username,
                credential: turnConfig.credential
            });
        }

        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Не удалось получить доступ к камере и микрофону');
    }
}

window.toggleMic = function() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.control-btn:first-child');
            btn.style.opacity = audioTrack.enabled ? '1' : '0.5';
        }
    }
}

window.toggleCamera = function() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('.control-btn:nth-child(2)');
            btn.style.opacity = videoTrack.enabled ? '1' : '0.5';
        }
    }
}

window.shareScreen = async function() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true 
        });
        
        const videoTrack = screenStream.getVideoTracks()[0];

        
        videoTrack.onended = () => {
            console.log('Screen sharing ended');
        };
        
    } catch (error) {
        console.error('Error sharing screen:', error);
    }
}

window.leaveVoice = function() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    document.getElementById('video-grid').innerHTML = '';
    document.getElementById('voice-panel').classList.remove('active');
    document.getElementById('messages-container').style.display = 'block';
    document.getElementById('message-input-container').style.display = 'block';
}

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Предотвращаем перевод строки
        sendMessage();
    }
}

function handleWebRTCSignal(data) {

    console.log('WebRTC signal:', data);
}
