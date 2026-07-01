// @ts-nocheck
export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (...args: unknown[]) => Promise<{ url: string }>,
) {
  const normalized = specifier.replace(/\\/g, '/');
  const parent = (context.parentURL ?? '').replace(/\\/g, '/');
  // Redirect the signature module imported from inside license-store only.
  if (
    (normalized === './signature.js' || normalized.endsWith('/license/signature.js')) &&
    parent.includes('/license/')
  ) {
    const loaderUrl = import.meta.url.replace(/\\/g, '/');
    const ext = loaderUrl.endsWith('.ts') ? '.ts' : '.js';
    const mockUrl = new URL(`./mock-license-signature${ext}`, import.meta.url).href;
    return { shortCircuit: true, url: mockUrl };
  }
  return nextResolve(specifier, context);
}
