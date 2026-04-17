// socket.js - Socket.io 客户端初始化
// 动态获取服务器地址，支持任意部署环境

(function () {
  const protocol = window.location.protocol;
  const host = window.location.host;
  const serverUrl = `${protocol}//${host}`;

  // 初始化 Socket.io 连接
  window.gameSocket = io(serverUrl, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  window.gameSocket.on('connect', () => {
    console.log('[Socket] 已连接:', window.gameSocket.id);
  });

  window.gameSocket.on('disconnect', () => {
    console.log('[Socket] 连接断开');
  });

  window.gameSocket.on('connect_error', (err) => {
    console.error('[Socket] 连接错误:', err.message);
  });
})();
