const { ipcRenderer } = require('electron');
const { createNavEngine } = require('./navEngine');

createNavEngine({ ipcRenderer }).attach();