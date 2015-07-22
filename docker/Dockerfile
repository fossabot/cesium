FROM centos:centos7
MAINTAINER mpg@flaxen.com

ENV \
    JAVA_HOME=/usr/lib/jvm/jre-1.6.0-openjdk.x86_64/ 

COPY build.sh /tmp/
RUN /tmp/build.sh

CMD /bin/bash
