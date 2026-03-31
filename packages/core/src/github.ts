export function buildGitHubAppInstallUrl(
  appSlug: string,
  options: { state?: string } = {}
): string {
  const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  if (options.state) {
    url.searchParams.set("state", options.state);
  }
  return url.toString();
}
