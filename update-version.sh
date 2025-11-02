#!/bin/bash

# Read version from version.txt
VERSION=$(cat version.txt | tr -d '[:space:]')

# Validate version format (X.Y.Z)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: Invalid version format in version.txt: \"$VERSION\"" >&2
    echo "Expected format: X.Y.Z (e.g., 0.0.15)" >&2
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found" >&2
    exit 1
fi

# Get old version from package.json
OLD_VERSION=$(grep -oP '(?<="version": ")[^"]*' package.json)

# Update version in package.json using sed
sed -i "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$VERSION\"/" package.json

echo "✓ Version updated: $OLD_VERSION → $VERSION"

git commit -m "set the right version in package.json" .
git push
