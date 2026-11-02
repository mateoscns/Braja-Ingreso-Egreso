# syntax=docker/dockerfile:1.7
# Backend image (CLAUDE.md rules 30-31). Built by deploy/deploy.sh and tagged with the git sha.
# Tests do not run here: CI runs them (`./mvnw verify`) before anything reaches main.

FROM eclipse-temurin:21-jdk-noble AS build
# Without unzip, mvnw falls back to the .tar.gz distribution and its checksum no longer matches the .zip one pinned in
# .mvn/wrapper/maven-wrapper.properties (2026-11-02: "Failed to validate Maven distribution SHA-256").
RUN apt-get update -q && apt-get install -y -q --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
# A checkout made on Windows has CRLF line endings, which break the wrapper script under sh and append \r to the
# distribution checksum the wrapper verifies.
RUN sed -i 's/\r$//' mvnw .mvn/wrapper/maven-wrapper.properties && chmod +x mvnw
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q -Dmaven.test.skip=true package \
    && cp target/fichaje-backend-*.jar /build/app.jar

FROM eclipse-temurin:21-jre-noble
RUN groupadd --system --gid 10001 braja && useradd --system --uid 10001 --gid braja --no-create-home --shell /usr/sbin/nologin braja
WORKDIR /app
COPY --from=build --chown=root:root /build/app.jar /app/app.jar
USER braja:braja
# Sized for a 4 GB VPS shared with MySQL and Caddy: the compose file caps the container at 1280 MB and the heap takes
# 70 % of it. An OutOfMemoryError ends the process so the restart policy starts a clean one. The JVM runs in UTC;
# local time is presentation only (rule 28).
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:InitialRAMPercentage=20 -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError -Duser.timezone=UTC -Dfile.encoding=UTF-8"
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=6 \
    CMD curl -fsS --max-time 4 http://127.0.0.1:8080/api/v1/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
