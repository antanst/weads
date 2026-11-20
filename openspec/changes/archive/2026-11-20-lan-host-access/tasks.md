# Tasks

## 1. Server

- [ ] 1.1 Add a failing guard test: `Host: 192.168.1.10:7707` on a server whose
      listen host is `192.168.1.10` answers 200, not 403.
- [ ] 1.2 Add the `host` field to `Server`, rename `loopbackHost` to a `hostOK`
      method that also accepts `s.host`, and pass the `-addr` host from `main`.
- [ ] 1.3 `go test ./...` and `go vet ./...` pass.

## 2. Verification

- [ ] 2.1 Build and run `weads -addr <local-ip>:port`; `curl` the root with the
      IP as Host and see 200 with HTML.
- [ ] 2.2 Confirm the loopback path still answers 200.
