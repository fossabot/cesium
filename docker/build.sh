#!/bin/bash

set -e

#
# base libs
#
yum -y install nodejs npm

#
# Ant
#
curl -L https://www.apache.org/dist/ant/binaries/apache-ant-1.9.5-bin.tar.gz -o /tmp/ant.tar.gz
tar xvf /tmp/ant.tar.gz -C /tmp
rm -rf /tmp/ant.tar.gz

#
# Rialto's Cesium
#
curl -L https://github.com/radiantbluetechnologies/rialto-cesium/archive/${RIALTO_BRANCH}_rialto.zip -o /tmp/cesium.zip
unzip -o -d /tmp /tmp/cesium.zip
mv /tmp/rialto-cesium-${RIALTO_BRANCH}_rialto /tmp/cesium
/tmp/apache-ant-1.9.5/bin/ant release -buildfile /tmp/cesium
mkdir -p /opt/cesium-build
cp -r /tmp/cesium/* /opt/cesium-build/

#
# cleanup
#
yum clean all
rm -rf \
    /tmp/apache-ant-1.9.5 \
    /tmp/cesium/ \
    /tmp/cesium.zip
