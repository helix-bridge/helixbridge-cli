#!/bin/bash
#

set -e

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

zx ${WORK_PATH}/program/helixrelayer-cli/src/index.mjs ${@}
