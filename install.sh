#!/usr/bin/bash

if [ "$EUID" -eq 0 ]
  then echo "Please do not run as root"
  exit
fi

APP=PBS-Deck
REPO=jpknoll/PBS-Deck
RELEASE_URL=https://api.github.com/repos/$REPO/releases/latest
RAW_BASE=https://raw.githubusercontent.com/$REPO/refs/heads/main

APPIMAGE_PATH=$HOME/Applications/$APP.AppImage
LAUNCHER_PATH=$HOME/.local/bin/pbs-deck
STEAM_HELPER_PATH=$HOME/.local/bin/pbs-deck-install-steam
DESKTOP_HELPER_PATH=$HOME/.local/bin/pbs-deck-add-desktop-entry
DESKTOP_ENTRY_PATH=$HOME/.local/share/applications/pbsdeck.desktop

# make dirs if non-existent
mkdir -p $HOME/.local/bin
mkdir -p $HOME/Applications

# remove old versions
rm -f $APPIMAGE_PATH
rm -f $LAUNCHER_PATH
rm -f $DESKTOP_ENTRY_PATH
rm -f $STEAM_HELPER_PATH
rm -f $DESKTOP_HELPER_PATH

echo "Downloading $APP AppImage"

wget \
    $(curl -s $RELEASE_URL | \
    jq -r ".assets[] | select(.name | test(\".*AppImage\")) | .browser_download_url") \
    -O $APPIMAGE_PATH

cat << EOF > $LAUNCHER_PATH
#!/bin/bash

if [ "\$USE_FULL_SCREEN" = "0" ]; then
  USE_FULL_SCREEN=0 $APPIMAGE_PATH --appname="\$1" --no-sandbox
else
  # default is fullscreen
  $APPIMAGE_PATH --appname="\$1" --no-sandbox
fi
EOF

cat << EOF > $DESKTOP_ENTRY_PATH
[Desktop Entry]
Name=PBS Deck
Exec=$APPIMAGE_PATH --no-sandbox %U
TryExec=$APPIMAGE_PATH
Terminal=false
Type=Application

StartupWMClass=PBSDeck
Comment=Controller-friendly PBS streaming launcher for SteamOS
Categories=AudioVideo;
EOF

curl -L $RAW_BASE/scripts/pbs-deck-install-steam.sh > $STEAM_HELPER_PATH
curl -L $RAW_BASE/scripts/pbs-deck-add-desktop-entry.sh > $DESKTOP_HELPER_PATH

chmod +x $APPIMAGE_PATH
chmod +x $LAUNCHER_PATH
chmod +x $STEAM_HELPER_PATH
chmod +x $DESKTOP_HELPER_PATH

IMAGE_INFO="/usr/share/ublue-os/image-info.json"

if [ -f "$IMAGE_INFO" ]; then
    echo "Ublue image detected"
    # handle for SE Linux
    sudo chcon -u system_u -r object_r --type=bin_t $APPIMAGE_PATH
    sudo chcon -u system_u -r object_r --type=bin_t $LAUNCHER_PATH
    sudo chcon -u system_u -r object_r --type=bin_t $STEAM_HELPER_PATH
    sudo chcon -u system_u -r object_r --type=bin_t $DESKTOP_HELPER_PATH
fi

echo "Installation complete"