// Minimal Deno globals so `tsc` can typecheck the Edge Function without Deno.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
