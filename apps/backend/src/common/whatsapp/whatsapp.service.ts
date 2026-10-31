import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppResult {
  ok: boolean;
  status: number | null;
  /** The API's reply (trimmed), or the network error. */
  response: string;
  /** Which request format got through: "curl" (form-encoded body, as the
   * documented curl sends it) or "json". */
  format: 'curl' | 'json' | null;
}

/**
 * Sends a text through the divtech WhatsApp gateway (send-unified-message):
 *
 *   curl --location "$WHATSAPP_API_URL" --data '{"sessionName":…,"type":"text","number":…,"message":…}'
 *
 * `curl --data` sends the JSON text with Content-Type
 * application/x-www-form-urlencoded, so that's tried first, exactly as the
 * curl does; if the gateway refuses it, the same body goes again as
 * application/json. A 2xx reply that says it failed counts as a failure.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService) {}

  settings() {
    const url = this.config.get<string>('WHATSAPP_API_URL')?.trim();
    const session = this.config.get<string>('WHATSAPP_SESSION_NAME')?.trim();
    return url && session ? { url, session } : null;
  }

  async sendText(number: string, message: string): Promise<WhatsAppResult> {
    const s = this.settings();
    if (!s) {
      return {
        ok: false,
        status: null,
        response:
          'WHATSAPP_API_URL / WHATSAPP_SESSION_NAME are not set on the server',
        format: null,
      };
    }
    const body = JSON.stringify({
      sessionName: s.session,
      type: 'text',
      number,
      message,
    });
    let last: WhatsAppResult = {
      ok: false,
      status: null,
      response: '',
      format: null,
    };
    for (const format of ['curl', 'json'] as const) {
      last = await this.post(s.url, body, format);
      // A refused format is worth retrying; a network error or a 5xx is not.
      if (last.ok || last.status === null || last.status >= 500) break;
    }
    if (!last.ok) {
      this.logger.warn(
        `WhatsApp to ${number.slice(0, 2)}******${number.slice(-2)} failed: ${last.status ?? 'no response'} ${last.response}`,
      );
    }
    return last;
  }

  private async post(
    url: string,
    body: string,
    format: 'curl' | 'json',
  ): Promise<WhatsAppResult> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':
            format === 'curl'
              ? 'application/x-www-form-urlencoded'
              : 'application/json',
          Accept: '*/*',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = (await res.text()).slice(0, 500);
      return {
        ok: res.ok && !reportsFailure(text),
        status: res.status,
        response: text,
        format,
      };
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? ` (${err.cause.message})`
          : '';
      return {
        ok: false,
        status: null,
        response: `${err instanceof Error ? err.message : String(err)}${cause}`,
        format,
      };
    }
  }
}

/** `{"success":false}`, `{"status":"error"}`, `{"error":"…"}` and the like. */
export function reportsFailure(text: string): boolean {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j.success === false || j.ok === false || j.status === false)
      return true;
    if (
      typeof j.status === 'string' &&
      /^(error|fail(ed|ure)?)$/i.test(j.status)
    )
      return true;
    if (j.error && j.error !== false) return true;
  } catch {
    // Not JSON: trust the HTTP status.
  }
  return false;
}
