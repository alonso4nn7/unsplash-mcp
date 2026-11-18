
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  UNSPLASH_ACCESS_KEY: string;
  MCP_BEARER_TOKEN: string;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "unsplash-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "search_photos",
    {
      description: "Busca fotografías en Unsplash.",
      inputSchema: z.object({
        query: z.string().min(1),
        per_page: z.number().int().min(1).max(10).optional(),
      }),
    },
    async ({ query, per_page }) => {
      if (!env.UNSPLASH_ACCESS_KEY) {
        return {
          content: [{ type: "text", text: "Falta configurar la clave de Unsplash en Cloudflare." }],
          isError: true,
        };
      }

      const params = new URLSearchParams({
        query,
        per_page: String(per_page ?? 5),
      });

      const response = await fetch(
        `https://api.unsplash.com/search/photos?${params}`,
        {
          headers: {
            Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
          },
        }
      );

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Error de Unsplash: ${response.status}` }],
          isError: true,
        };
      }

      const data = await response.json() as any;

      const photos = data.results.map((photo: any) => ({
        id: photo.id,
        description: photo.alt_description ?? photo.description,
        image_url: photo.urls.regular,
        photographer: photo.user.name,
        photographer_url: `${photo.user.links.html}?utm_source=unsplash_mcp&utm_medium=referral`,
        photo_page: `${photo.links.html}?utm_source=unsplash_mcp&utm_medium=referral`,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify(photos, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    "track_photo_download",
    {
      description: "Registra la selección o descarga de una fotografía de Unsplash.",
      inputSchema: z.object({
        photo_id: z.string().regex(/^[A-Za-z0-9_-]+$/),
      }),
    },
    async ({ photo_id }) => {
      if (!env.UNSPLASH_ACCESS_KEY) {
        return {
          content: [{ type: "text", text: "Falta configurar la clave de Unsplash en Cloudflare." }],
          isError: true,
        };
      }

      const response = await fetch(
        `https://api.unsplash.com/photos/${encodeURIComponent(photo_id)}/download`,
        {
          headers: {
            Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
          },
        }
      );

      if (!response.ok) {
        return {
          content: [{ type: "text", text: "No se pudo registrar la descarga." }],
          isError: true,
        };
      }

      const data = await response.json() as any;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ download_url: data.url }),
        }],
      };
    }
  );

  return server;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
  if (
    !env.MCP_BEARER_TOKEN ||
    request.headers.get("Authorization") !== `Bearer ${env.MCP_BEARER_TOKEN}`
  ) {
    return new Response("No autorizado", { status: 401 });
  }

  return createMcpHandler(() => createServer(env))(request, env, ctx);
  }
