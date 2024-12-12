import { getServerSideConfig } from "@/app/config/server";
import {
  CHATGLM_BASE_URL,
  ApiPath,
  ModelProvider,
  ServiceProvider,
} from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth";
import { isModelAvailableInServer } from "@/app/utils/model";

const serverConfig = getServerSideConfig();

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[GLM Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req, ModelProvider.ChatGLM);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await request(req);
    return response;
  } catch (e) {
    console.error("[GLM] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

async function request(req: NextRequest) {
  const controller = new AbortController();

  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.ChatGLM, "");
  let baseUrl = serverConfig.chatglmUrl || CHATGLM_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[GLM Proxy] path:", path);
  console.log("[GLM Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  const fetchUrl = `${baseUrl}${path}`;
  console.log("[GLM Fetch Url]", fetchUrl);

  // Clone and process request body
  let body = req.body;
  let contentType = req.headers.get("Content-Type") || "application/json";
  let bodyText = "";

  if (body) {
    try {
      bodyText = await req.text();
      const jsonBody = JSON.parse(bodyText);
      
      // Log the request body for debugging
      console.log("[GLM Request Body]", JSON.stringify(jsonBody, null, 2));
      
      body = bodyText;
    } catch (e) {
      console.error("[GLM] Failed to process request body:", e);
      return NextResponse.json(
        { error: true, message: "Invalid request body" },
        { status: 400 },
      );
    }
  }

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": contentType,
      Authorization: req.headers.get("Authorization") ?? "",
    },
    method: req.method,
    body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  try {
    const response = await fetch(fetchUrl, fetchOptions);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("content-type", response.headers.get("content-type") ?? "application/json");
    
    if (!response.ok) {
      const error = await response.json();
      console.error("[GLM API Error]", error);
      return NextResponse.json(error, { status: response.status });
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error("[GLM Fetch Error]", e);
    return NextResponse.json(
      { error: true, message: "Failed to fetch from GLM API" },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
