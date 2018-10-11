// import { remote } from 'electron';

const menu = document.querySelector('#menu');
const expandButton = document.querySelector('#expandButton');

let resizeEndTimeout;

// const page = document.querySelector('#page');

// const controlBar = document.querySelector('#controlsBar');
// const playingImage = document.querySelector('#playingImage');
// const playingImageShade = document.querySelector('#playingImageShade');

// const seekBar = document.querySelector('#seekBar');
// const volumeBar = document.querySelector('#volumeBar');

// const playButton = document.querySelector('#playButton');
// const playButton1 = document.querySelector('.playButton1');
// const playButton2 = document.querySelector('.playButton2');

// let playingState = false;

window.onload = () =>
{
  document.body.classList.remove('noMotion');
};

window.onresize = () =>
{
  // clear old resize-end timeout event
  if (resizeEndTimeout)
    clearTimeout(resizeEndTimeout);

  // add no-motion class
  if (!document.body.classList.contains('noMotion'))
    document.body.classList.add('noMotion');

  // set a new resize-end timeout
  resizeEndTimeout = setTimeout(resizeEnd, 150);
};

function resizeEnd()
{
  // remove no-motion class
  document.body.classList.remove('noMotion');

  // turn the menu to default state again
  if (!menu.classList.contains('default'))
  {
    menu.classList.add('default');

    if (menu.classList.contains('collapse'))
      menu.classList.remove('collapse');
    else if (menu.classList.contains('expand'))
      menu.classList.remove('expand');
  }
}

// seekBar.style.setProperty('--barX', '50%');

// volumeBar.style.setProperty('--barX', '10%');

// playButton.onclick = () =>
// {
//   togglePlayButton();
// };

expandButton.onclick = toggleMenu;

// function togglePlayButton()
// {
//   playingState = !playingState;

//   playButton1.classList.toggle('pauseButton1');
//   playButton2.classList.toggle('pauseButton2');
// }

function toggleMenu()
{
  if (menu.classList.contains('default'))
  {
    if (window.getComputedStyle(menu).getPropertyValue('--default-state').trim() === '1')
      menu.classList.add('collapse');
    else
      menu.classList.add('expand');

    menu.classList.remove('default');
  }
  else if (menu.classList.contains('collapse'))
  {
    menu.classList.remove('collapse');
    menu.classList.add('expand');
  }
  else
  {
    menu.classList.remove('expand');
    menu.classList.add('collapse');
  }
}