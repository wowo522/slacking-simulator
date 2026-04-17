// Room.js - 房间管理

const { GameState } = require('./GameState');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

class Room {
  constructor(code) {
    this.code = code;
    this.players = {}; // socketId -> { id, name }
    this.gameState = null;
    this.status = 'waiting'; // 'waiting' | 'playing' | 'ended'
    this.hostId = null;
    this.createdAt = Date.now();
  }

  addPlayer(socketId, name) {
    if (Object.keys(this.players).length >= MAX_PLAYERS) {
      return { error: '房间已满（最多6人）' };
    }
    if (this.status === 'playing') {
      return { error: '游戏已开始，无法加入' };
    }
    // 检查名字是否重复
    const names = Object.values(this.players).map(p => p.name);
    if (names.includes(name)) {
      name = name + Math.floor(Math.random() * 100);
    }
    this.players[socketId] = { id: socketId, name };
    if (!this.hostId) this.hostId = socketId;
    return { success: true, name };
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    // 如果房主离开，转让房主
    if (this.hostId === socketId) {
      const remaining = Object.keys(this.players);
      this.hostId = remaining.length > 0 ? remaining[0] : null;
    }
    // 如果游戏中，移除游戏状态里的玩家
    if (this.gameState) {
      this.gameState.removePlayer(socketId);
    }
    return Object.keys(this.players).length;
  }

  canStart() {
    return Object.keys(this.players).length >= MIN_PLAYERS && this.status === 'waiting';
  }

  startGame(emitToRoom) {
    if (!this.canStart()) return false;

    this.status = 'playing';
    this.gameState = new GameState(this.code);

    // 添加所有玩家到游戏状态
    for (const [socketId, info] of Object.entries(this.players)) {
      this.gameState.addPlayer(socketId, info.name);
    }

    // 启动游戏循环
    this.gameState.start((event, data) => {
      emitToRoom(event, data);
      if (event === 'game-over') {
        this.status = 'ended';
      }
    });

    return true;
  }

  handleInput(socketId, input) {
    if (this.gameState) {
      this.gameState.handleInput(socketId, input);
    }
  }

  handleToggleSlacking(socketId) {
    if (this.gameState) {
      this.gameState.toggleSlacking(socketId);
    }
  }

  handleReport(socketId) {
    if (this.gameState) {
      this.gameState.report(socketId);
    }
  }

  getRoomInfo() {
    return {
      code: this.code,
      players: Object.values(this.players),
      status: this.status,
      hostId: this.hostId,
      playerCount: Object.keys(this.players).length,
    };
  }

  isEmpty() {
    return Object.keys(this.players).length === 0;
  }

  destroy() {
    if (this.gameState) {
      this.gameState.stop();
    }
  }
}

// 房间管理器
class RoomManager {
  constructor() {
    this.rooms = {}; // code -> Room
    this.playerRoom = {}; // socketId -> code
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms[code]);
    return code;
  }

  createRoom(socketId, playerName) {
    const code = this.generateCode();
    const room = new Room(code);
    this.rooms[code] = room;
    const result = room.addPlayer(socketId, playerName);
    if (result.error) return result;
    this.playerRoom[socketId] = code;
    return { success: true, code, name: result.name, room };
  }

  joinRoom(socketId, code, playerName) {
    const room = this.rooms[code.toUpperCase()];
    if (!room) return { error: '房间不存在，请检查房间码' };
    const result = room.addPlayer(socketId, playerName);
    if (result.error) return result;
    this.playerRoom[socketId] = code.toUpperCase();
    return { success: true, code: code.toUpperCase(), name: result.name, room };
  }

  getPlayerRoom(socketId) {
    const code = this.playerRoom[socketId];
    return code ? this.rooms[code] : null;
  }

  removePlayer(socketId) {
    const room = this.getPlayerRoom(socketId);
    if (!room) return null;
    const remaining = room.removePlayer(socketId);
    delete this.playerRoom[socketId];
    if (remaining === 0) {
      room.destroy();
      delete this.rooms[room.code];
    }
    return room;
  }

  getRoom(code) {
    return this.rooms[code.toUpperCase()] || null;
  }
}

module.exports = { Room, RoomManager };
