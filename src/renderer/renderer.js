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
  resizeEnd();
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
  resizeEndTimeout = setTimeout(resizeEnd, 25);
};

function resizeEnd()
{
  const menuItemSingularPartHeight = Math.round(menu.getBoundingClientRect().height * (2 / 100));
  const menuHamburgerSingularPartHeight = Math.round(menu.getBoundingClientRect().height * (1.35 / 100));

  let menuButtonHeight = Math.max(26, menuItemSingularPartHeight * 3);
  let menuHamburgerHeight = Math.max(19, menuHamburgerSingularPartHeight * 3);
  
  // only odd number
  if (!(menuButtonHeight % 2))
    menuButtonHeight = menuButtonHeight + 1;

  if (!(menuHamburgerHeight % 2))
    menuHamburgerHeight = menuHamburgerHeight - 1;

  menu.style.setProperty('--button-height', menuButtonHeight + 'px');
  menu.style.setProperty('--hamburger-height', menuHamburgerHeight + 'px');

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

// expandButton.onclick = toggleMenu;

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