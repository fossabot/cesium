# rialto-cesium

FROM radiantbluetechnologies/rialtobase-java
MAINTAINER mpg@flaxen.com

ENV RIALTO_BRANCH=dev

RUN git clone https://github.com/radiantbluetechnologies/rialto-cesium.git /tmp/rialto-cesium

#COPY ./build.sh /tmp/rialto-cesium/
RUN /tmp/rialto-cesium/docker/build.sh

CMD /bin/bash
