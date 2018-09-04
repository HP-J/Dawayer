import { remote } from 'electron';

const mainWindow = remote.getCurrentWindow();

const menu = document.querySelector('#menu');
const expandButton = document.querySelector('#expandButton');

const page = document.querySelector('#page');

const controlBar = document.querySelector('#controlsBar');
const playingImage = document.querySelector('#playingImage');
const playingImageShade = document.querySelector('#playingImageShade');

const seekBar = document.querySelector('#seekBar');
const volumeBar = document.querySelector('#volumeBar');

const playPauseButton = document.querySelector('#playPauseButton');
const playPauseButton1 = document.querySelector('.playPauseButton1');
const playPauseButton2 = document.querySelector('.playPauseButton2');

let playingState = false;

let menuState = false;

seekBar.style.setProperty('--barX', '10%');
// volumeBar.style.setProperty('--barX', '10%');

playPauseButton.onclick = () =>
{
  if (!playingState)
    pause();
  else
    play();
};

expandButton.onclick = () =>
{
  if (!menuState)
    expand();
  else
    collapse();
};

function play()
{
  playingState = false;

  playPauseButton1.classList.remove('pause1');
  playPauseButton2.classList.remove('pause2');
  
  playPauseButton1.classList.add('play1');
  playPauseButton2.classList.add('play2');
}

function pause()
{
  playingState = true;

  playPauseButton1.classList.remove('play1');
  playPauseButton2.classList.remove('play2');
  
  playPauseButton1.classList.add('pause1');
  playPauseButton2.classList.add('pause2');
}

function expand()
{
  menuState = true;

  menu.classList.remove('collapse');

  menu.classList.add('expand');
}

function collapse()
{
  menuState = false;

  menu.classList.remove('expand');
  
  menu.classList.add('collapse');
}