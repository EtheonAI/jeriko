#!/bin/bash
# Cross-compile parallel engine for all platforms
# Usage: ./build.sh

set -e

cd "$(dirname "$0")"

BINARY="parallel-engine"
LDFLAGS="-s -w"

echo "Building parallel engine..."

# Build matrix
platforms=(
  "darwin/arm64"
  "darwin/amd64"
  "linux/amd64"
  "linux/arm64"
  "windows/amd64"
)

for platform in "${platforms[@]}"; do
  IFS="/" read -r goos goarch <<< "$platform"
  output="${BINARY}-${goos}-${goarch}"
  if [ "$goos" = "windows" ]; then
    output="${output}.exe"
  fi

  echo "  ${goos}/${goarch} -> ${output}"
  GOOS=$goos GOARCH=$goarch go build -ldflags="$LDFLAGS" -o "$output" main.go
done

# Also build for current platform as default binary
echo "  current platform -> ${BINARY}"
go build -ldflags="$LDFLAGS" -o "$BINARY" main.go

echo "Done. Built ${#platforms[@]} platform binaries + default."
ls -lh ${BINARY}*
