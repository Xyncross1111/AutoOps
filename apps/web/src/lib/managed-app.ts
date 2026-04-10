export function formatManagedFrameworkName(value: string | null | undefined) {
  if (value === "nextjs") {
    return "Next.js";
  }

  if (value === "nuxt") {
    return "Nuxt";
  }

  if (value === "express") {
    return "Express";
  }

  if (value === "nestjs") {
    return "NestJS";
  }

  if (value === "react" || value === "react_cra") {
    return "React";
  }

  if (value === "vue") {
    return "Vue";
  }

  if (value === "astro") {
    return "Astro";
  }

  if (value === "static_html") {
    return "Static HTML";
  }

  return value ? value.replace(/[_-]+/g, " ") : "Managed App";
}

export function formatRepositoryFrameworkName(value: string | null | undefined) {
  if (value === "nextjs") {
    return "Next.js";
  }

  if (value === "nuxt") {
    return "Nuxt";
  }

  if (value === "express") {
    return "Express";
  }

  if (value === "nestjs") {
    return "NestJS";
  }

  if (value === "react" || value === "react_cra") {
    return "React";
  }

  if (value === "vue") {
    return "Vue";
  }

  if (value === "astro") {
    return "Astro";
  }

  if (value === "static_html") {
    return "HTML";
  }

  return "Unknown";
}

export function getRepositoryFrameworkTone(value: string | null | undefined) {
  if (value === "nextjs") {
    return "tone-nextjs";
  }

  if (value === "nuxt" || value === "express" || value === "nestjs") {
    return "tone-nextjs";
  }

  if (value === "react" || value === "react_cra") {
    return "tone-react";
  }

  if (value === "vue" || value === "astro") {
    return "tone-react";
  }

  if (value === "static_html") {
    return "tone-html";
  }

  return "tone-unknown";
}

export function formatManagedModeLabel(value: string | null | undefined) {
  const framework = formatManagedFrameworkName(value);
  if (framework === "Managed App") {
    return framework;
  }

  return `Managed ${framework}`;
}
