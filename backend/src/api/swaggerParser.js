/**
 * Parses Swagger/OpenAPI specs and Postman collections into
 * a normalised endpoint list the AI scenario builder can consume.
 */

/**
 * Fetch and parse a Swagger/OpenAPI spec from a URL.
 * Supports JSON and YAML (JSON only for now).
 * @param {string} url
 * @returns {Promise<NormalisedSpec>}
 */
export async function parseSwaggerUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  let spec;

  if (contentType.includes("yaml") || url.endsWith(".yaml") || url.endsWith(".yml")) {
    throw new Error("YAML specs not supported yet — please use a JSON Swagger URL or convert to JSON first.");
  }

  spec = await res.json();
  return normaliseOpenAPI(spec);
}

/**
 * Parse a raw Postman collection object (already parsed from JSON).
 * @param {object} collection
 * @returns {NormalisedSpec}
 */
export function parsePostmanCollection(collection) {
  const info = collection.info ?? {};
  const endpoints = [];

  function extractItems(items, folderPath = "") {
    for (const item of items ?? []) {
      if (item.item) {
        // folder — recurse
        extractItems(item.item, `${folderPath}${item.name}/`);
      } else if (item.request) {
        const req = item.request;
        const url = typeof req.url === "string" ? req.url : req.url?.raw ?? "";
        const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\{\{[^}]+\}\}/g, "{param}") || "/";

        endpoints.push({
          method:      (req.method ?? "GET").toUpperCase(),
          path,
          summary:     item.name,
          description: item.name,
          parameters:  (req.url?.query ?? []).map(q => ({ name: q.key, in: "query", description: q.value })),
          requestBody: req.body?.raw ? tryParseJSON(req.body.raw) : null,
          tags:        [folderPath.replace(/\/$/, "") || "default"],
          folder:      folderPath.replace(/\/$/, "") || "root",
        });
      }
    }
  }

  extractItems(collection.item);

  return {
    title:       info.name ?? "Postman Collection",
    version:     info.version ?? "1.0",
    description: info.description ?? "",
    baseUrl:     "",
    endpoints,
    source:      "postman",
  };
}

/**
 * Normalise an OpenAPI 2.x or 3.x spec into our standard format.
 * @param {object} spec
 * @returns {NormalisedSpec}
 */
function normaliseOpenAPI(spec) {
  const isV3 = !!spec.openapi;
  const info  = spec.info ?? {};

  // Base URL
  let baseUrl = "";
  if (isV3) {
    baseUrl = spec.servers?.[0]?.url ?? "";
  } else {
    const scheme = spec.schemes?.[0] ?? "https";
    baseUrl = spec.host ? `${scheme}://${spec.host}${spec.basePath ?? ""}` : "";
  }

  const endpoints = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get","post","put","patch","delete","head","options"]) {
      const op = pathItem[method];
      if (!op) continue;

      // Extract request body schema
      let requestBody = null;
      if (isV3 && op.requestBody) {
        const content = op.requestBody.content ?? {};
        const jsonContent = content["application/json"];
        requestBody = jsonContent?.schema ?? null;
      } else if (!isV3 && op.parameters) {
        const bodyParam = op.parameters.find(p => p.in === "body");
        requestBody = bodyParam?.schema ?? null;
      }

      // Extract response schema
      const responses = {};
      for (const [code, resp] of Object.entries(op.responses ?? {})) {
        const schema = isV3
          ? resp.content?.["application/json"]?.schema
          : resp.schema;
        responses[code] = { description: resp.description, schema };
      }

      endpoints.push({
        method:      method.toUpperCase(),
        path,
        summary:     op.summary ?? "",
        description: op.description ?? op.summary ?? "",
        parameters:  op.parameters ?? [],
        requestBody,
        responses,
        tags:        op.tags ?? ["default"],
        operationId: op.operationId ?? `${method}_${path.replace(/\W/g, "_")}`,
        security:    op.security ?? spec.security ?? [],
      });
    }
  }

  return {
    title:       info.title ?? "API",
    version:     info.version ?? "1.0",
    description: info.description ?? "",
    baseUrl,
    endpoints,
    source:      isV3 ? "openapi3" : "swagger2",
  };
}

function tryParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * @typedef {Object} NormalisedSpec
 * @property {string} title
 * @property {string} version
 * @property {string} description
 * @property {string} baseUrl
 * @property {object[]} endpoints
 * @property {string} source
 */
