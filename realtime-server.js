const WebSocket = require('ws');

const PORT = process.env.PORT || 4000;

const wss = new WebSocket.Server({ port: PORT });

const clients = new Map();
const voiceUsers = new Map();
const chatHistory = [];
const CHAT_HISTORY_MAX = 100;

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

function broadcastExcept(exceptWs, data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'hello' && msg.user) {
      const userInfo = {
        id: msg.user.id,
        name: msg.user.name,
        avatar: msg.user.avatar || null,
        displayRoles: msg.user.displayRoles || []
      };
      clients.set(ws, userInfo);

      ws.send(JSON.stringify({ type: 'chat_history', messages: chatHistory }));
      const userList = {};
      clients.forEach((info, w) => { if (w !== ws) userList[info.id] = { displayRoles: info.displayRoles }; });
      ws.send(JSON.stringify({ type: 'user_list', users: userList }));
      broadcastExcept(ws, { type: 'user_joined', user: userInfo });

      ws.send(
        JSON.stringify({
          type: 'voice_users',
          users: Array.from(voiceUsers.values())
        })
      );
      return;
    }

    if (msg.type === 'chat_message' && msg.message) {
      chatHistory.push(msg.message);
      if (chatHistory.length > CHAT_HISTORY_MAX) chatHistory.shift();
      broadcast({ type: 'chat_message', message: msg.message });
      return;
    }

    if (msg.type === 'join_voice') {
      const userInfo = clients.get(ws);
      if (!userInfo) return;

      const state = voiceUsers.get(userInfo.id) || {
        id: userInfo.id,
        name: userInfo.name,
        avatar: userInfo.avatar || null,
        muted: false,
        speakerMuted: false,
        speaking: false,
        cameraOn: false,
        streaming: false
      };

      voiceUsers.set(userInfo.id, state);

      broadcast({
        type: 'voice_users',
        users: Array.from(voiceUsers.values())
      });
      return;
    }

    if (msg.type === 'leave_voice') {
      const userInfo = clients.get(ws);
      if (!userInfo) return;

      voiceUsers.delete(userInfo.id);

      broadcast({
        type: 'voice_users',
        users: Array.from(voiceUsers.values())
      });
      return;
    }

    if (msg.type === 'voice_state' && msg.userId && msg.state) {
      const current = voiceUsers.get(msg.userId);
      if (!current) return;

      Object.assign(current, msg.state);
      voiceUsers.set(msg.userId, current);

      broadcast({
        type: 'voice_users',
        users: Array.from(voiceUsers.values())
      });
    }
  });

  ws.on('close', () => {
    const userInfo = clients.get(ws);
    clients.delete(ws);

    if (userInfo && voiceUsers.has(userInfo.id)) {
      voiceUsers.delete(userInfo.id);
      broadcast({
        type: 'voice_users',
        users: Array.from(voiceUsers.values())
      });
    }
  });
});

console.log(`Realtime server listening on ws://localhost:${PORT}`);

