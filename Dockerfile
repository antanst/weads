# weads is one static binary, but it execs `bd`, which needs glibc — hence the
# slim runtime instead of scratch; mount your bd into /bd.
#
#   docker build -t weads .
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
ENTRYPOINT ["/weads"]
