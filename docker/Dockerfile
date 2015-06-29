FROM centos:centos7
MAINTAINER mpg@flaxen.com

EXPOSE 8080

ENV \
    JAVA_HOME=/usr/lib/jvm/jre-1.6.0-openjdk.x86_64/ \
    BRANCH=master_rialto

COPY build.sh /tmp/
RUN /tmp/build.sh

COPY nginx.conf /etc/nginx/

CMD nginx
