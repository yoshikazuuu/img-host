package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

type S3Service struct {
	s3Client *s3.Client
	bucket   string
}

func NewR2Service() (*S3Service, error) {
	account := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	accessKey := os.Getenv("CLOUDFLARE_ACCESS_KEY_ID")
	secretKey := os.Getenv("CLOUDFLARE_ACCESS_KEY_SECRET")
	bucket := os.Getenv("CLOUDFLARE_BUCKET_NAME")

	if account == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return nil, fmt.Errorf("missing required environment variables")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"),
	)

	if err != nil {
		log.Fatal(err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(fmt.Sprintf("https://%s.r2.cloudflarestorage.com", account))
	})

	return &S3Service{
		s3Client: client,
		bucket:   bucket,
	}, nil
}

func (s *S3Service) UploadFileToR2(ctx context.Context, key string, file []byte, contentType string) error {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(file),
		ContentType: aws.String(contentType),
	}

	_, err := s.s3Client.PutObject(ctx, input)
	return err
}

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
	err := godotenv.Load()
	if err != nil {
		log.Fatalf("Error loading .env file")
	}

	s3Service, err := NewR2Service()
	if err != nil {
		log.Fatalf("Error initializing R2 service: %v", err)
	}

	app := fiber.New()

	// CORS middleware with whitelist
	app.Use(cors.New(cors.Config{
		AllowOrigins: os.Getenv("FRONTEND_URL"),
		AllowMethods: "GET,POST,OPTIONS",     // Ensure OPTIONS method is allowed for preflight
		AllowHeaders: "Content-Type, Accept", // Add necessary headers
	}))

	app.Use(logger.New())

	app.Post("/upload", func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "File is required"})
		}

		// Check if the file is an image
		contentType := fileHeader.Header.Get("Content-Type")
		if !strings.HasPrefix(contentType, "image/") {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Only image files are allowed"})
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

		ext := filepath.Ext(fileHeader.Filename)
		name := strings.TrimSuffix(fileHeader.Filename, ext)
		hash := fmt.Sprintf("%x", time.Now().UnixNano())[8:]
		filename := fmt.Sprintf("%s-%s%s", name, hash, ext)

		ctx := context.TODO()
		err = s3Service.UploadFileToR2(ctx, filename, buf.Bytes(), contentType)
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to upload file"})
		}

		return c.JSON(fiber.Map{"message": "Image uploaded successfully", "filename": filename})
	})

	app.Get("/:key", func(c *fiber.Ctx) error {
		key := c.Params("key")

		ctx := context.TODO()
		file, contentType, err := s3Service.GetFileFromR2(ctx, key)
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to retrieve file"})
		}

		c.Set("Content-Type", contentType)
		return c.Send(file)
	})

	log.Fatal(app.Listen(":8081"))
}
