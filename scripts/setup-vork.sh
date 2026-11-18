#!/bin/sh
# Installs the vork renderer used by this project.
# The curl installer pulls its payload from release-assets.githubusercontent.com,
# which is not reachable from this sandbox, so we use the npm package instead
# (same 0.6.0 native runtime, served from registry.npmjs.org).
set -e
npm install -g @voyager-so/vork
export PATH="/usr/local/bin:$PATH"
vork --version
