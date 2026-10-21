#!/bin/sh
# Installe ou réinstalle Watson sur Mac :
#   curl -fsSL https://raw.githubusercontent.com/wandabardey/watson/main/installer/install.sh | sh
# Télécharge la dernière version publiée, vérifie son empreinte SHA-256, l'installe dans ~/Applications.
# Ensuite, Watson se met à jour tout seul.
set -eu

DEPOT="wandabardey/watson"
# Un Terminal lancé avec Rosetta répond x86_64 à uname même sur un Mac Apple Silicon : on demande au système.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  ARCH="aarch64"
else
  ARCH="x64"
fi

echo "Recherche de la dernière version de Watson…"
INFOS=$(curl -fsSL "https://api.github.com/repos/$DEPOT/releases/latest")
lien() { printf '%s\n' "$INFOS" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/' | grep -E "$1" | head -n 1; }
ARCHIVE=$(lien "_${ARCH}\.app\.tar\.gz$")
if [ -z "$ARCHIVE" ] && [ "$ARCH" = "aarch64" ]; then
  ARCHIVE=$(lien '\.app\.tar\.gz$' | grep -v x64 || true)
fi
if [ -z "$ARCHIVE" ] && [ "$ARCH" = "x64" ]; then
  echo "Cette version de Watson n'existe pas encore pour les Mac Intel." >&2; exit 1
fi
EMPREINTES=$(lien '/SHA256SUMS$')
if [ -z "$ARCHIVE" ] || [ -z "$EMPREINTES" ]; then
  echo "Version introuvable sur https://github.com/$DEPOT/releases" >&2; exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
NOM=$(basename "$ARCHIVE")
curl -fsSL -o "$TMP/$NOM" "$ARCHIVE"
curl -fsSL -o "$TMP/SHA256SUMS" "$EMPREINTES"
ATTENDU=$(grep " \*\{0,1\}$NOM\$" "$TMP/SHA256SUMS" | cut -d' ' -f1)
OBTENU=$(shasum -a 256 "$TMP/$NOM" | cut -d' ' -f1)
if [ -z "$ATTENDU" ] || [ "$ATTENDU" != "$OBTENU" ]; then
  echo "Empreinte incorrecte : le téléchargement a été altéré, installation annulée." >&2; exit 1
fi
codesign --verify --deep "$TMP" >/dev/null 2>&1 || true

mkdir -p "$HOME/Applications"
tar -xzf "$TMP/$NOM" -C "$TMP"
rm -rf "$HOME/Applications/Watson.app"
mv "$TMP/Watson.app" "$HOME/Applications/Watson.app"
xattr -dr com.apple.quarantine "$HOME/Applications/Watson.app" 2>/dev/null || true
codesign --verify --deep "$HOME/Applications/Watson.app" && echo "Signature vérifiée."
echo "Watson est installé dans ~/Applications. Ouverture…"
open "$HOME/Applications/Watson.app"
