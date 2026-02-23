const { WebSocketServer } = require('ws');
const url = require('url');
const { validateToken } = require('./auth');

// In-memory registry: nodeName -> { ws, connectedAt, lastPing }
const nodes = new Map();

// Pending tasks: taskId -> { resolve, reject, chunks }
const pendingTasks = new Map();

let taskCounter = 0;

function setup(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = url.parse(req.url, true);

    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const nodeName = query.name;
    const token = query.token;

    if (!nodeName || !token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!validateToken(nodeName, token)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, nodeName);
    });
  });

  wss.on('connection', (ws, req, nodeName) => {
    console.log(`[ws] Node connected: ${nodeName}`);

    // Disconnect old connection with same name
    if (nodes.has(nodeName)) {
      nodes.get(nodeName).ws.terminate();
    }

    nodes.set(nodeName, {
      ws,
      connectedAt: new Date(),
      lastPing: new Date(),
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleNodeMessage(nodeName, msg);
      } catch (err) {
        console.error(`[ws] Bad message from ${nodeName}:`, err.message);
      }
    });

    ws.on('close', () => {
      console.log(`[ws] Node disconnected: ${nodeName}`);
      nodes.delete(nodeName);
    });

    ws.on('pong', () => {
      const node = nodes.get(nodeName);
      if (node) node.lastPing = new Date();
    });
  });

  // Heartbeat every 30s
  setInterval(() => {
    for (const [name, node] of nodes) {
      if (node.ws.readyState === node.ws.OPEN) {
        node.ws.ping();
      }
    }
  }, 30000);

  return wss;
}

function handleNodeMessage(nodeName, msg) {
  const { taskId, type, data } = msg;
  const pending = pendingTasks.get(taskId);
  if (!pending) return;

  if (type === 'chunk') {
    pending.chunks.push(data);
    if (pending.onChunk) pending.onChunk(data);
  } else if (type === 'result') {
    pendingTasks.delete(taskId);
    pending.resolve(pending.chunks.join(''));
  } else if (type === 'error') {
    pendingTasks.delete(taskId);
    pending.reject(new Error(data));
  }
}

function sendTask(nodeName, command, onChunk) {
  return new Promise((resolve, reject) => {
    const node = nodes.get(nodeName);
    if (!node || node.ws.readyState !== node.ws.OPEN) {
      return reject(new Error(`Node "${nodeName}" is not connected`));
    }

    const taskId = String(++taskCounter);
    pendingTasks.set(taskId, { resolve, reject, chunks: [], onChunk });

    node.ws.send(JSON.stringify({ taskId, command }));

    // 5 minute timeout
    setTimeout(() => {
      const timedOut = pendingTasks.get(taskId);
      if (timedOut) {
        pendingTasks.delete(taskId);
        resolve(timedOut.chunks.join('') || '(timeout — no output)');
      }
    }, 5 * 60 * 1000);
  });
}

function getConnectedNodes() {
  const result = [];
  for (const [name, node] of nodes) {
    result.push({
      name,
      connectedAt: node.connectedAt,
      lastPing: node.lastPing,
      alive: node.ws.readyState === node.ws.OPEN,
    });
  }
  return result;
}

function isNodeConnected(name) {
  const node = nodes.get(name);
  return node && node.ws.readyState === node.ws.OPEN;
}

module.exports = { setup, sendTask, getConnectedNodes, isNodeConnected };
