# Use golang image as base
FROM golang:1.22-alpine

# Set the working directory
WORKDIR /app

# Copy go.mod and go.sum first to leverage Docker cache
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the entire project
COPY . .

# Build the Go application
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -trimpath -o backend

# Expose port 8080
EXPOSE 8081

# Command to be executed when the container starts
CMD ["./backend"]
