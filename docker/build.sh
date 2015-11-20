#!/bin/bash

set -e

#
# base libs
#
yum -y install nodejs npm

#
# Ant
#
curl -L https://www.apache.org/dist/ant/binaries/apache-ant-1.9.6-bin.tar.gz -o /tmp/ant.tar.gz
tar xvf /tmp/ant.tar.gz -C /tmp
rm -rf /tmp/ant.tar.gz

#
# Rialto's Cesium
#
/tmp/apache-ant-1.9.6/bin/ant release -buildfile /tmp/cesium
mkdir -p /opt/cesium-build
cp -r /tmp/cesium/* /opt/cesium-build/

#
# cleanup
#
yum clean all
rm -rf /tmp/*

