/**
 * Cloudflare Worker for R2 Operations
 * Handles file upload, retrieval, and deletion with CORS support
 */

// Replace with your actual frontend URL
import { R2Bucket } from '@cloudflare/workers-types';

const ALLOWED_ORIGINS = ['https://img.jer.ee', 'http://localhost:3000'];

export interface Env {
	R2_BUCKET: R2Bucket;
}

export interface UploadResponse {
	message: string;
	filename: string;
}

export interface ErrorResponse {
	error: string;
}

export type WorkerResponse = Response | UploadResponse | ErrorResponse;

export interface ExportedHandler<Env = unknown> {
	fetch: (
		request: Request,
		env: Env,
		ctx: ExecutionContext
	) => Promise<WorkerResponse>;
}

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return handleOptions(request);
		}

		const url = new URL(request.url);
		let key = url.pathname.substring(5);

		switch (request.method) {
			case 'POST':
				if (url.pathname === '/img/upload') {
					return handleUpload(request, env);
				}
				return new Response('Not Found', { status: 404 });
			case 'GET':
				return handleGet(request, key, env);
			default:
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						'Allow': 'GET, POST',
						'Access-Control-Allow-Origin': getAllowedOrigin(request),
					},
				});
		}
	},
} satisfies ExportedHandler<Env>;

function getAllowedOrigin(request: Request): string {
	const origin = request.headers.get('Origin');
	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		return origin;
	}
	return ALLOWED_ORIGINS[0];
}

async function handleOptions(_request: Request): Promise<Response> {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': getAllowedOrigin(_request),
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Accept',
		},
	});
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
	try {
		const formData = await request.formData();
		const file = formData.get('file');

		// Check if the file exists
		if (!file || !(file instanceof File)) {
			return new Response(JSON.stringify({ error: 'File is required' }), {
				status: 400,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': getAllowedOrigin(request),
				},
			});
		}

		// Check if the file is an image
		if (!file.type.startsWith('image/')) {
			return new Response(JSON.stringify({ error: 'Only image files are allowed' }), {
				status: 400,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': getAllowedOrigin(request),
				},
			});
		}

		const ext = '.' + file.name.split('.').pop();
		const name = file.name.slice(0, -ext.length);
		const hash = Date.now().toString(16).slice(-8);
		const filename = `${name}-${hash}${ext}`;

		await env.R2_BUCKET.put(filename, file.stream(), {
			httpMetadata: { contentType: file.type },
		});

		return new Response(JSON.stringify({ message: 'Image uploaded successfully', filename }), {
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': getAllowedOrigin(request),
			},
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: 'Failed to upload file' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': getAllowedOrigin(request),
			},
		});
	}
}

async function handleGet(request: Request, key: string, env: Env): Promise<Response> {
	const object = await env.R2_BUCKET.get(key);

	if (object === null) {
		return new Response('Object Not Found', {
			status: 404,
			headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(request) },
		});
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Access-Control-Allow-Origin', getAllowedOrigin(request));

	return new Response(object.body, { headers });
}