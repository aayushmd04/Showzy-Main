import type { ApiConversation, ApiMessage, ApiOffer } from "@/lib/api";

/**
 * Helpers for the booking thread (`/bookings/:id`), which reads the server's
 * conversation. The `:id` is either a conversation id or the id of the booking
 * that conversation produced, so a booking link and a thread link land on the
 * same screen.
 */

/** The conversation a `/bookings/:id` URL points at. */
export function findThread(convos: ApiConversation[], id: string): ApiConversation | undefined {
  return convos.find((c) => c.id === id) ?? convos.find((c) => c.order_id === id);
}

/** Every offer that has appeared in the thread, oldest first, with its current status. */
export function offersIn(messages: ApiMessage[]): ApiOffer[] {
  return messages.flatMap((m) => (m.message_type === "offer" && m.offer ? [m.offer] : []));
}

export type ThreadStatus =
  | { kind: "booked" }
  | { kind: "awaiting-you"; offer: ApiOffer }
  | { kind: "awaiting-them"; offer: ApiOffer }
  | { kind: "closed"; offer: ApiOffer }
  | { kind: "chatting" };

/**
 * Where the negotiation stands from `me`'s side: an accepted offer is a
 * booking; a pending one is waiting on whoever did not make it; a thread whose
 * last offer was turned down is closed until someone makes another.
 */
export function threadStatus(
  convo: Pick<ApiConversation, "order_id" | "pending_offer">,
  offers: ApiOffer[],
  me: string | undefined,
): ThreadStatus {
  if (convo.order_id) return { kind: "booked" };
  const pending = convo.pending_offer;
  if (pending) {
    return pending.proposed_by === me
      ? { kind: "awaiting-them", offer: pending }
      : { kind: "awaiting-you", offer: pending };
  }
  const last = offers[offers.length - 1];
  if (last && (last.status === "rejected" || last.status === "withdrawn" || last.status === "expired")) {
    return { kind: "closed", offer: last };
  }
  return { kind: "chatting" };
}
