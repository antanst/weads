BIN := weads

.PHONY: build test vet run

build:
	go build -trimpath -ldflags "-s -w" -o $(BIN) .

test:
	go test -race -count=1 ./...

vet:
	go vet ./...

run: build
	./$(BIN)
