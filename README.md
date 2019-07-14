# Welcome to Dawayer

Dawayer is an audio player built with web technologies it lets you play local files, download and stream podcasts, stream music from a streaming service, Dawayer also has a feed page that gives you personalized playlists, statistics about your listening habits and notifies you when your favorite artist published a new track or a new podcast episode.

Dawayer is still in development with main features being added gradually, we're currently adding the feed and the streaming service support.

#### Features
- Play podcasts.
- Play local audio files.
- Gives you personalized playlists and statistics.
- All the other modern audio player features like saving your seek-time and queue between sessions and etc...
- MPRIS Player support for linux.
- Dark Mode.

#### Screenshots
![Albums Page](pictures/albums.png)
![Tracks Page](pictures/tracks.png)
![Artists Page](pictures/artists.png)
![Now Playing Page](pictures/playing.png)
![Artist's Page](pictures/artistOverlay.png)

# Download

**We need people to test macOS version before we can release it.**

- **Linux:**
[AUR](https://aur.archlinux.org/packages/dawayer) |
[deb](https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/release/raw/public/Dawayer.deb?job=build) |
[tar.xz](https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/release/raw/public/Dawayer.tar.xz?job=build)
- **Windows:**
[Setup](https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/release/raw/public/Dawayer-Setup.exe?job=build)

# Build It Yourself
If you want to try the latest features from the development branch, or your platform don't get an official release, or want to help in Dawayer's development.  

(make sure you install Git and NPM on your device first)  
open a terminal in a new folder and write:

- git clone "https://gitlab.com/hpj/Dawayer.git" .  
- npm install  
- npm run build  
- npx electron "./build/main/main.js"

# Licenses
This project is licensed under the [MIT](https://gitlab.com/hpj/Dawayer/blob/development/LICENSE) License.  
All icons inside the [icons](https://gitlab.com/hpj/Dawayer/tree/development/assets) folder are made by us and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

# Acknowledgments
the Queue design is inspired by [Phonograph](https://play.google.com/store/apps/details?id=com.kabouzeid.gramophone) created by [Karim Abou Zeid](https://kabouzeid.com/).  
the Album design is inspired by this [dribble](https://dribbble.com/shots/4579038-Foodiefit-Interaction-studio-included) created by [Kreativa Studio](https://dribbble.com/KreativaStudio/).  
