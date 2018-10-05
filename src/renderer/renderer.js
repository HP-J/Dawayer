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

const playButton = document.querySelector('#playButton');
const playButton1 = document.querySelector('.playButton1');
const playButton2 = document.querySelector('.playButton2');

let playingState = false;

let menuState = false;

window.onload = () =>
{
  document.body.classList.remove('preload');
};

// seekBar.style.setProperty('--barX', '50%');

// volumeBar.style.setProperty('--barX', '10%');

// playButton.onclick = () =>
// {
//   togglePlayButton();
// };

expandButton.onclick = () =>
{
  if (!menuState)
    expand();
  else
    collapse();
};

function togglePlayButton()
{
  playingState = !playingState;

  playButton1.classList.toggle('pauseButton1');
  playButton2.classList.toggle('pauseButton2');
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