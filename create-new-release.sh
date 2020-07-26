#!/bin/bash

# sync with git
git fetch
git pull

# get the version number and the true tar.xz url
VERSION=$(echo $(($(date +%s%N)/1000000)))
TAR_URL=$(curl -I -s -L -o -w 'Dawayer.tar.xz' 'https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/release/raw/public/Dawayer.tar.xz?job=build' | grep 'Location' | awk -F': ' '{print $2}' | tail -1)

# download the new files from the remote host
curl -L -o 'Dawayer.tar.xz' 'https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/release/raw/public/Dawayer.tar.xz?job=build'

# update the package info
# removes the last 5 lines then adds them back with the new values
echo "$(head -n -5 PKGBUILD)" > PKGBUILD
echo "pkgver=$VERSION" >> PKGBUILD
echo "pkgrel=1" >> PKGBUILD
echo "source=('icon.png' 'Dawayer.desktop' 'Dawayer-$VERSION.tar.xz'::'$TAR_URL')" >> PKGBUILD
echo "md5sums=('$(md5sum icon.png | awk '{print $1}')' '$(md5sum Dawayer.desktop | awk '{print $1}')' '$(md5sum Dawayer.tar.xz | awk '{print $1}')')" >> PKGBUILD

# clean after yourself
# remove the downloaded files
rm Dawayer.tar.xz

# flip is a utility program that removes the CRLF characters from the fille
# the CRLF characters are fromm the $TAR_URL
flip -u PKGBUILD

# to upload or update a package add at least PKGBUILD and .SRCINFO 
makepkg --printsrcinfo > .SRCINFO

# checks the PKGBUILD for some of the widely known issues
if [[ $(namcap PKGBUILD) ]]; then
  namcap PKGBUILD
else
  # if no issues were found then stages the new PKGBUILD and .SRCINFO and commits them
  git add -f PKGBUILD .SRCINFO
  git commit -m "auto committed a new build as '$VERSION'"

  echo "A new commit was made successfully with version number set as '$VERSION'"
  echo "You can push it now but remember to check the files for mistakes"
fi
