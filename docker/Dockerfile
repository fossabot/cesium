# rialto/cesium

FROM rialto/base-java
MAINTAINER mpg@flaxen.com

RUN git clone https://github.com/rialto/cesium.git /tmp/cesium

RUN /tmp/rialto-cesium/docker/build.sh \
  && rm -fr /tmp/*

CMD /bin/bash
