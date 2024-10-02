"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LinkIcon } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const formSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }),
  customId: z
    .union([
      z
        .string()
        .length(0, { message: "Custom ID must not contain any spaces." }),
      z
        .string()
        .min(1)
        .regex(/^[a-zA-Z0-9-_]+$/, {
          message:
            "Custom ID can only contain letters, numbers, hyphens, and underscores.",
        }),
    ])
    .optional(),
});

export function URLShortenerForm({
  setShortUrl,
  setErrorMessage,
}: {
  setShortUrl: (url: string) => void;
  setErrorMessage: (message: string) => void;
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
      customId: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/shorten`,
        values
      );
      setShortUrl(response.data.shortURL);
      setErrorMessage("");
      toast.success("URL shortened successfully");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setErrorMessage(err.response.data.error || "Custom ID already exists");
        toast.error(err.response.data.error || "Custom ID already exists");
      } else {
        console.error(err);
        setErrorMessage("Failed to shorten URL. Please try again.");
        toast.error("Failed to shorten URL. Please try again.");
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative">
                  <Input
                    type="url"
                    placeholder="Enter your long URL"
                    {...field}
                    className="focus-within:ring-2 focus-visible:ring-2 focus-visible:ring-primary focus-within:ring-primary focus-within:border-transparent w-full bg-gray-700/50 border-gray-600 text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent pr-10"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <LinkIcon className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="customId"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="flex items-center bg-gray-700/50 border border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
                  <span className="pl-3 text-gray-400 h-full flex items-center">
                    jer.ee/
                  </span>
                  <Input
                    type="text"
                    placeholder="custom-code (optional)"
                    {...field}
                    className="flex-grow bg-transparent focus-visible:ring-0 focus:outline-none border-none focus:ring-0 text-gray-100 placeholder-gray-400 p-2 outline-none"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">
          Shorten URL
        </Button>
      </form>
    </Form>
  );
}
