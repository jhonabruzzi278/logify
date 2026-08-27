import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Verifica que nginx.prod.conf (usado por el despliegue Docker/VPS) exponga
// el mismo set de headers de seguridad que vercel.json, en TODAS las
// locations. add_header en nginx no se hereda cuando la location define su
// propio add_header, asi que un header agregado solo a nivel server puede
// "desaparecer" silenciosamente en una location especifica.

const CONF_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "nginx.prod.conf",
);
const VERCEL_CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "vercel.json",
);

const REQUIRED_HEADERS = [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Content-Security-Policy",
];

function splitIntoBlocks(conf: string): string[] {
  // Cada bloque top-level (server { ... } o location ... { ... }) balanceado por llaves.
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < conf.length; i++) {
    if (conf[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (conf[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        blocks.push(conf.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

function findLocationBlocks(serverBlock: string): string[] {
  const blocks: string[] = [];
  // Ancla a inicio de linea con \b para no matchear "location=()" dentro del
  // valor del header Permissions-Policy (geolocation=()).
  const regex = /^[ \t]*location\b[^{]*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(serverBlock)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (depth > 0 && i < serverBlock.length) {
      if (serverBlock[i] === "{") depth++;
      else if (serverBlock[i] === "}") depth--;
      i++;
    }
    blocks.push(serverBlock.slice(match.index, i));
  }

  return blocks;
}

describe("Frontend/nginx.prod.conf - headers de seguridad", () => {
  const conf = readFileSync(CONF_PATH, "utf-8");
  const [serverBlock] = splitIntoBlocks(conf);
  const locationBlocks = findLocationBlocks(serverBlock);

  it("define al menos un bloque server con locations", () => {
    expect(serverBlock).toBeTruthy();
    expect(locationBlocks.length).toBeGreaterThan(0);
  });

  it("declara todos los headers requeridos a nivel server", () => {
    for (const header of REQUIRED_HEADERS) {
      expect(serverBlock).toMatch(new RegExp(`add_header\\s+${header}\\b`));
    }
  });

  it.each(REQUIRED_HEADERS)(
    "el header %s esta presente (heredado o explicito) en cada location",
    (header) => {
      for (const block of locationBlocks) {
        const definesOwnHeaders = /add_header/.test(block);
        if (!definesOwnHeaders) {
          // Sin add_header propio, nginx hereda los del server: OK.
          continue;
        }
        expect(block).toMatch(new RegExp(`add_header\\s+${header}\\b`));
      }
    },
  );

  it("cada add_header de seguridad usa 'always' (se envia tambien en respuestas de error)", () => {
    const headerLines = conf
      .split("\n")
      .filter((line) => REQUIRED_HEADERS.some((h) => line.includes(`add_header ${h}`)));
    expect(headerLines.length).toBeGreaterThan(0);
    for (const line of headerLines) {
      expect(line).toMatch(/always;\s*$/);
    }
  });

  it("permite la camara al propio portal para el lector de codigos del POS", () => {
    const vercelConfig = readFileSync(VERCEL_CONFIG_PATH, "utf-8");

    expect(conf).toContain('Permissions-Policy "camera=(self), microphone=(), geolocation=()"');
    expect(vercelConfig).toContain('"value": "camera=(self), microphone=(), geolocation=()"');
    expect(conf).not.toContain('Permissions-Policy "camera=(),');
    expect(vercelConfig).not.toContain('"value": "camera=(),');
  });
});
