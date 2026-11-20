# weads is one static binary, but it execs `bd`, which needs glibc — hence the
# slim runtime instead of scratch; mount your bd into /bd.
#
#   docker build -t weads --build-arg UID=$(id -u) --build-arg GID=$(id -g) .
#   docker run --rm --network host -v weads:/data -v "$HOME/.local/bin:/bd:ro" weads
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /weads .

FROM debian:stable-slim
COPY --from=build /weads /weads
ENV HOME=/data PATH=/bd:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Run as the owner of the mounted projects: bd rewrites .beads/ Dolt store
# files even with --readonly, so a mismatched uid leaves them with the wrong
# owner. A fresh named volume inherits this /data ownership.
ARG UID=1000 GID=1000
RUN mkdir -p /data && chown "$UID:$GID" /data
USER $UID:$GID
ENTRYPOINT ["/weads"]
