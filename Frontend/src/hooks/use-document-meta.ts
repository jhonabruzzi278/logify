import { useEffect } from "react";

const SITE_NAME = "Logify";

interface DocumentMetaOptions {
  title: string;
  description?: string;
  /** Solo pasar para rutas públicas que deben ser indexables (ver public/robots.txt). */
  canonicalPath?: string;
}

function upsertMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function removeCanonical() {
  document.querySelector('link[rel="canonical"]')?.remove();
}

/** Sincroniza <title>, meta description y canonical con la página activa (la app es un SPA sin SSR). */
export function useDocumentMeta({ title, description, canonicalPath }: DocumentMetaOptions) {
  useEffect(() => {
    document.title = `${title} · ${SITE_NAME}`;

    if (description) {
      upsertMeta("description", description);
    }

    if (canonicalPath) {
      upsertCanonical(`${window.location.origin}${canonicalPath}`);
    } else {
      removeCanonical();
    }

    return () => removeCanonical();
  }, [title, description, canonicalPath]);
}
