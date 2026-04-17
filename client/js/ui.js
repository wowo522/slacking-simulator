// ui.js - 主页 UI 交互逻辑

(function () {
  const socket = window.gameSocket;

  // DOM 元素
  const mainMenu = document.getElementById('main-menu');
  const waitingRoom = document.getElementById('waiting-room');
  const playerNameInput = document.getElementById('player-name');
  const roomCodeInput = document.getElementById('room-code-input');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');
  const btnStart = document.getElementById('btn-start');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const errorMsg = document.getElementById('error-msg');
  const roomCodeText = document.getElementById('room-code-text');
  const playerCount = document.getElementById('player-count');
  const playerList = document.getElementById('player-list');
  const waitingTip = document.getElementById('waiting-tip');

  let myRoomCode = null;
  let myName = null;
  let isHost = false;

  // 工具函数
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 4000);
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  function switchToWaiting(code, roomInfo, host) {
    mainMenu.classList.add('hidden');
    waitingRoom.classList.remove('hidden');
    roomCodeText.textContent = code;
    isHost = host;

    if (host) {
      btnStart.classList.remove('hidden');
      waitingTip.textContent = '需要至少 2 名玩家才能开始游戏';
    } else {
      btnStart.classList.add('hidden');
      waitingTip.textContent = '等待房主开始游戏...';
    }

    updatePlayerList(roomInfo);
  }

  function updatePlayerList(roomInfo) {
    playerCount.textContent = roomInfo.playerCount;
    playerList.innerHTML = '';

    const colors = ['#4A90D9', '#E67E22', '#2ECC71', '#9B59B6', '#E74C3C', '#1ABC9C'];
    roomInfo.players.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div class="player-avatar" style="background:${colors[i % colors.length]}"></div>
        <span class="player-item-name">${escapeHtml(p.name)}</span>
        ${p.id === roomInfo.hostId ? '<span class="player-host-tag">房主</span>' : ''}
      `;
      playerList.appendChild(item);
    });

    // 更新开始按钮状态
    if (isHost) {
      btnStart.disabled = roomInfo.playerCount < 2;
      waitingTip.textContent = roomInfo.playerCount < 2
        ? '还需要至少 1 名玩家才能开始'
        : `已有 ${roomInfo.playerCount} 名玩家，可以开始！`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // 创建房间
  btnCreate.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      showError('请先输入你的名字！');
      playerNameInput.focus();
      return;
    }
    hideError();
    btnCreate.disabled = true;
    btnCreate.textContent = '创建中...';
    socket.emit('create-room', { playerName: name });
  });

  // 加入房间
  btnJoin.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) {
      showError('请先输入你的名字！');
      playerNameInput.focus();
      return;
    }
    if (!code || code.length !== 6) {
      showError('请输入 6 位房间码！');
      roomCodeInput.focus();
      return;
    }
    hideError();
    btnJoin.disabled = true;
    socket.emit('join-room', { playerName: name, code });
  });

  // 开始游戏
  btnStart.addEventListener('click', () => {
    socket.emit('start-game');
    btnStart.disabled = true;
    btnStart.textContent = '开始中...';
  });

  // 复制房间码
  btnCopyCode.addEventListener('click', () => {
    if (myRoomCode) {
      navigator.clipboard.writeText(myRoomCode).then(() => {
        btnCopyCode.textContent = '✅';
        setTimeout(() => btnCopyCode.textContent = '📋', 2000);
      }).catch(() => {
        // fallback
        const el = document.createElement('input');
        el.value = myRoomCode;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        btnCopyCode.textContent = '✅';
        setTimeout(() => btnCopyCode.textContent = '📋', 2000);
      });
    }
  });

  // 回车键支持
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnCreate.click();
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoin.click();
    // 自动大写
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
  });

  roomCodeInput.addEventListener('input', () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
  });

  // Socket 事件
  socket.on('room-joined', (data) => {
    myRoomCode = data.code;
    myName = data.playerName;
    sessionStorage.setItem('gameRoomCode', data.code);
    sessionStorage.setItem('gamePlayerName', data.playerName);
    sessionStorage.setItem('gameSocketId', socket.id);
    switchToWaiting(data.code, data.roomInfo, data.isHost);

    btnCreate.disabled = false;
    btnCreate.innerHTML = '<span>🏠</span> 创建房间';
    btnJoin.disabled = false;
  });

  socket.on('room-error', (data) => {
    showError(data.message);
    btnCreate.disabled = false;
    btnCreate.innerHTML = '<span>🏠</span> 创建房间';
    btnJoin.disabled = false;
    btnStart.disabled = false;
    btnStart.innerHTML = '🎮 开始游戏';
  });

  socket.on('player-joined', (data) => {
    updatePlayerList(data.roomInfo);
  });

  socket.on('player-left', (data) => {
    updatePlayerList(data.roomInfo);
    // 如果现在是房主
    if (data.roomInfo.hostId === socket.id) {
      isHost = true;
      btnStart.classList.remove('hidden');
    }
  });

  socket.on('game-started', () => {
    // 跳转到游戏页面
    window.location.href = '/game';
  });

  // 如果页面刷新后已有 session，尝试恢复（不自动重连，仅提示）
  const savedCode = sessionStorage.getItem('gameRoomCode');
  if (savedCode) {
    roomCodeInput.value = savedCode;
  }
})();
