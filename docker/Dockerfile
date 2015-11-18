# rialto-cesium

FROM radiantbluetechnologies/rialtobase-java
MAINTAINER mpg@flaxen.com

ENV RIALTO_BRANCH=dev

COPY ./build.sh /tmp/rialto-cesium/
RUN /tmp/rialto-cesium/build.sh

CMD /bin/bash
