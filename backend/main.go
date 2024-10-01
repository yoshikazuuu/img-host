package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

type S3Service struct {
	s3Client *s3.Client
	bucket   string
}

// Function to initialize Cloudflare R2 service
func NewR2Service() (*S3Service, error) {
	account := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	accessKey := os.Getenv("CLOUDFLARE_ACCESS_KEY_ID")
	secretKey := os.Getenv("CLOUDFLARE_SECRET_ACCESS_KEY")
	bucket := os.Getenv("CLOUDFLARE_BUCKET_NAME")

	if account == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return nil, fmt.Errorf("missing required environment variables")
	}

	// Create custom resolver for R2 endpoint
	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: fmt.Sprintf("https://%s.r2.cloudflarestorage.com", account),
		}, nil
	})

	// Load AWS config with custom resolver
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithEndpointResolverWithOptions(r2Resolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"), // Use 'auto' instead of 'apac' for R2
	)
	if err != nil {
		return nil, err
	}

	// Create a new S3 client
	s3Client := s3.NewFromConfig(cfg)

	return &S3Service{
		s3Client: s3Client,
		bucket:   bucket,
	}, nil
}

// Function to upload file to Cloudflare R2 Storage
func (s *S3Service) UploadFileToR2(ctx context.Context, key string, file []byte, contentType string) error {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(file),
		ContentType: aws.String(contentType),
	}

	// Upload the file
	_, err := s.s3Client.PutObject(ctx, input)
	return err
}

// Function to download file from Cloudflare R2 Storage
func (s *S3Service) GetFileFromR2(ctx context.Context, key string) ([]byte, string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	output, err := s.s3Client.GetObject(ctx, input)
	if err != nil {
		return nil, "", err
	}
	defer output.Body.Close()

	buffer := new(bytes.Buffer)
	_, err = io.Copy(buffer, output.Body)
	if err != nil {
		return nil, "", err
	}

	return buffer.Bytes(), aws.ToString(output.ContentType), nil
}

func main() {
	// Load .env file
	err := godotenv.Load()
	if err != nil {
		log.Fatalf("Error loading .env file")
	}

	// Initialize the Cloudflare R2 service
	s3Service, err := NewR2Service()
	if err != nil {
		log.Fatal(err)
	}

	// Initialize Fiber
	app := fiber.New()
	app.Use(logger.New())

	// Endpoint to upload files
	app.Post("/upload", func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "File is required"})
		}

		file, err := fileHeader.Open()
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file"})
		}
		defer file.Close()

		buf := new(bytes.Buffer)
		_, err = io.Copy(buf, file)
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read file"})
		}

		ctx := context.TODO()
		err = s3Service.UploadFileToR2(ctx, fileHeader.Filename, buf.Bytes(), fileHeader.Header.Get("Content-Type"))
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to upload file"})
		}

		return c.JSON(fiber.Map{"message": "File uploaded successfully"})
	})

	// Endpoint to serve files
	app.Get("/files/:key", func(c *fiber.Ctx) error {
		key := c.Params("key")

		ctx := context.TODO()
		file, contentType, err := s3Service.GetFileFromR2(ctx, key)
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to retrieve file"})
		}

		c.Set("Content-Type", contentType)
		return c.Send(file)
	})

	log.Fatal(app.Listen(":3000"))
}
