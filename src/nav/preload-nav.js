const { ipcRenderer } = require('electron');
const { createNavEngine } = require('./navEngine');

const domDump = process.env.PBS_DECK_DOM_DUMP === '1';

createNavEngine({ ipcRenderer, domDump }).attach();