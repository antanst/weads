# Spec Delta

## Purpose

Defines how the weads HTTP surface decides which `Host` headers it answers.

## MODIFIED Requirements

### Requirement: Host header check

weads SHALL reject every request whose `Host` host part is neither a loopback
name (`localhost`, `127.0.0.1`, or `::1`, with any port) nor the host of the
configured listen address. The rejection status SHALL be 403. This keeps the
DNS-rebinding guard while letting the user serve weads on a real address.

#### Scenario: Rebinding host

- **WHEN** a request arrives with `Host: evil.example:7707`
- **THEN** weads responds 403 and does not run the handler

#### Scenario: Loopback host

- **WHEN** a request arrives with `Host: localhost:7707`
- **THEN** weads serves the request

#### Scenario: Listen address host

- **WHEN** weads runs with `-addr 192.168.1.10:7707` and a request arrives
  with `Host: 192.168.1.10:7707`
- **THEN** weads serves the request
