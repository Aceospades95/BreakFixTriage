import { getSession } from "@/lib/auth/session";
import { subscribe } from "@/lib/events/bus";

/**
 * Server-Sent Events stream.
 *
 * Clients subscribe once with `new EventSource("/api/events")` and
 * receive a JSON event whenever the in-process bus fires. The
 * kanban and dashboards pages use this to replace polling with
 * push updates — no interval, instant board refresh.
 *
 * Auth: we deliberately don't read any per-user data here. The
 * event payload is a bare entity id, which means a subscriber
 * can only use it as a signal to re-fetch the page they're
 * already allowed to read. Still, we gate the endpoint on an
 * authenticated session so unauthenticated bots can't open
 * long-lived connections.
 *
 * Heartbeat: we push a comment (`:`) every 15 seconds so
 * reverse proxies don't idle-kill the socket.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial retry hint — if the browser loses the connection
      // it will auto-reconnect after 5s.
      controller.enqueue(encoder.encode("retry: 5000\n\n"));

      const unsubscribe = subscribe((event) => {
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Best-effort; a closed controller will throw and we
          // just bail.
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15000);

      // Wire up cleanup through a sentinel that Next will call
      // when the client disconnects.
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      // @ts-expect-error — attach for optional AbortSignal hookup
      controller._cleanup = cleanup;
    },
    cancel() {
      // Reader has gone away (tab closed, navigation, etc.)
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
