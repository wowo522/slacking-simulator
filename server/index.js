// index.js - 服务端主入口

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./game/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 4567;
const roomManager = new RoomManager();

// 静态文件服务 - 服务 client/ 目录
app.use(express.static(path.join(__dirname, '../client')));

// 根路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/game.html'));
});

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log(`[+] 玩家连接: ${socket.id}`);

  // 创建房间
  socket.on('create-room', ({ playerName }) => {
    if (!playerName || playerName.trim() === '') {
      socket.emit('room-error', { message: '请输入玩家名称' });
      return;
    }

    const result = roomManager.createRoom(socket.id, playerName.trim());
    if (result.error) {
      socket.emit('room-error', { message: result.error });
      return;
    }

    socket.join(result.code);
    socket.emit('room-joined', {
      code: result.code,
      playerName: result.name,
      roomInfo: result.room.getRoomInfo(),
      isHost: true,
    });
    console.log(`[房间] 创建: ${result.code} by ${result.name}`);
  });

  // 加入房间
  socket.on('join-room', ({ code, playerName }) => {
    if (!playerName || playerName.trim() === '') {
      socket.emit('room-error', { message: '请输入玩家名称' });
      return;
    }
    if (!code || code.trim() === '') {
      socket.emit('room-error', { message: '请输入房间码' });
      return;
    }

    const result = roomManager.joinRoom(socket.id, code.trim(), playerName.trim());
    if (result.error) {
      socket.emit('room-error', { message: result.error });
      return;
    }

    socket.join(result.code);
    socket.emit('room-joined', {
      code: result.code,
      playerName: result.name,
      roomInfo: result.room.getRoomInfo(),
      isHost: false,
    });

    // 通知房间其他人
    socket.to(result.code).emit('player-joined', {
      roomInfo: result.room.getRoomInfo(),
    });

    console.log(`[房间] ${result.name} 加入房间 ${result.code}`);
  });

  // 房主开始游戏
  socket.on('start-game', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) {
      socket.emit('room-error', { message: '未找到房间' });
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit('room-error', { message: '只有房主可以开始游戏' });
      return;
    }
    if (!room.canStart()) {
      socket.emit('room-error', { message: '需要至少2名玩家才能开始' });
      return;
    }

    const started = room.startGame((event, data) => {
      io.to(room.code).emit(event, data);
    });

    if (started) {
      io.to(room.code).emit('game-started', {
        roomInfo: room.getRoomInfo(),
      });
      console.log(`[游戏] 房间 ${room.code} 游戏开始，${Object.keys(room.players).length} 名玩家`);
    }
  });

  // 玩家输入（方向键）
  socket.on('player-input', (input) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      room.handleInput(socket.id, input);
    }
  });

  // 切换摸鱼/工作状态
  socket.on('toggle-slacking', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      room.handleToggleSlacking(socket.id);
    }
  });

  // 举报玩家
  socket.on('report', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      room.handleReport(socket.id);
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    const room = roomManager.removePlayer(socket.id);
    if (room && !room.isEmpty()) {
      io.to(room.code).emit('player-left', {
        roomInfo: room.getRoomInfo(),
      });
    }
    console.log(`[-] 玩家断线: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 上班模拟器：摸鱼大作战 服务已启动`);
  console.log(`📡 访问地址: http://localhost:${PORT}`);
  console.log(`⏰ ${new Date().toLocaleString()}\n`);
});
