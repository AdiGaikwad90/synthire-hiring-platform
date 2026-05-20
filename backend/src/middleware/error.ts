import type { ErrorHandler } from 'hono'
import { ZodError } from 'zod'
import { AppError } from '../types/api'
import type { Env } from '../types/bindings'
import { nanoid } from 'nanoid'

export const errorHandler: ErrorHandler<{ Bindings: Env }> = (err, c) => {
  const timestamp = new Date().toISOString()
  const request_id = nanoid(12)

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        data: null,
        error: err.message,
        details: err.details ?? null,
        timestamp,
        request_id,
      },
      err.statusCode as Parameters<typeof c.json>[1]
    )
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        data: null,
        error: 'Validation failed',
        details: err.flatten(),
        timestamp,
        request_id,
      },
      422
    )
  }

  console.error('[Unhandled Error]', err)
  return c.json(
    {
      success: false,
      data: null,
      error: 'Internal server error',
      timestamp,
      request_id,
    },
    500
  )
}
