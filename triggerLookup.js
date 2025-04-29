#!/usr/bin/env node
/* eslint-disable no-console */
const net  = require('net');
const cp   = require('child_process');
const path = require('path');
const os   = require('os');

const HOST = '127.0.0.1';
const PORT = 5050;
const WORD = process.argv[2] || 'hello';

function sendWord(word, cb) {
  const socket = net.createConnection({ host: HOST, port: PORT, timeout: 1000 });
  socket.on('connect', () => { socket.end(word); cb(true); });
  socket.on('error',   () => cb(false));
}

sendWord(WORD, ok => {
  if (ok) return;
  // 启动 Electron 守护
  console.log('Server not running, spawning…');
  const projectRoot = path.resolve(__dirname);
  cp.spawn(process.execPath, ['node_modules/.bin/electron', projectRoot], {
    cwd: projectRoot, detached: true, stdio: 'ignore'
  }).unref();
  setTimeout(() => sendWord(WORD, ()=>{}), 1200);
});