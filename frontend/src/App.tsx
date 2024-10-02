"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CopyIcon, AlertCircle, Upload } from "lucide-react";
import { toast, Toaster } from "sonner";
import Starry from "@/components/starry";
import { ThemeProvider } from "./components/theme-provider";
import { useDropzone } from "react-dropzone";

export default function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setIsUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const data = await response.json();
        const fullImageUrl = `${import.meta.env.VITE_API_URL}/${data.filename}`;
        setImageUrl(fullImageUrl);
        toast.success(data.message);
      } catch (err) {
        console.log(err);

        setError("Failed to upload image. Please try again.");
        toast.error("Upload failed");
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    disabled: isUploading,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(imageUrl);
    toast.success("Image URL copied to clipboard");
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-[100svh] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <Toaster position="top-center" />
        <Starry
          minSize={0.5}
          maxSize={2}
          opacity={0.25}
          particleDensity={40}
          className="fixed h-full w-full"
        />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-secondary/30 p-8 rounded-lg shadow-lg backdrop-blur-sm border border-secondary relative z-10"
        >
          <h1 className="text-3xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-muted-foreground">
            Image Uploader
          </h1>
          <div
            {...getRootProps()}
            className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-200 ${
              isDragActive
                ? "border-primary bg-primary/20"
                : "border-gray-600 hover:border-primary/50"
            } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-balance text-gray-300">
              {isUploading
                ? "Uploading..."
                : "Drag 'n' drop an image here, or click to select one"}
            </p>
          </div>
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-4 p-2 bg-red-500/20 border border-red-500 rounded text-red-200 flex items-center"
              >
                <AlertCircle className="w-5 h-5 mr-2" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {imageUrl && (
              <motion.div
                key="imageUrl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-6 p-4 bg-gray-700/50 rounded border border-gray-600"
              >
                <p className="text-sm mb-2 text-gray-300">
                  Your uploaded image:
                </p>
                <div className="mb-4">
                  <img
                    src={imageUrl}
                    alt="Uploaded image"
                    className="w-full h-auto rounded"
                  />
                </div>
                <div className="flex items-center justify-between bg-gray-600/50 p-2 rounded">
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 truncate mr-2"
                  >
                    {imageUrl}
                  </a>
                  <Button
                    onClick={handleCopy}
                    size="sm"
                    variant="ghost"
                    className="text-gray-300 hover:text-white focus:ring-2 focus:ring-primary shrink-0 transition-colors duration-200"
                  >
                    <CopyIcon className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 text-gray-400 text-sm"
        >
          © {new Date().getFullYear()} Jerry Febriano
        </motion.div>
      </div>
    </ThemeProvider>
  );
}
