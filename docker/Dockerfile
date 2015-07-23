# rialto-cesium

FROM centos:centos7
MAINTAINER mpg@flaxen.com

ENV JAVA_HOME=/usr/lib/jvm/jre-1.6.0-openjdk.x86_64/ \
    RIALTO_BRANCH=dev

COPY build.sh /tmp/
RUN /tmp/build.sh

CMD /bin/bash
