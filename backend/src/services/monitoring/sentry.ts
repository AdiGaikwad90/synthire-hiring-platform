import { Toucan } from 'toucan-js'

export function createSentry(
  request: Request,
  ctx: ExecutionContext,
  dsn: string,
): Toucan {
  return new Toucan({
    dsn,
    context: ctx,
    request,
    tracesSampleRate: 0.1,
    environment: 'production',
  })
}
