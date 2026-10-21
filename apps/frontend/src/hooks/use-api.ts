/**
 * SWR hooks for API data. Used in screens that need live data
 * beyond what the store preloads at login.
 */
import useSWR from "swr";
import { swrFetcher, tokens } from "@/lib/api";
import type {
  ApiEventList,
  ApiArtistList,
  ApiBookingReviews,
  ApiConversation,
  ApiMessage,
  ApiOrder,
} from "@/lib/api";

const isAuthed = () => Boolean(tokens.access);

export function useApiEvents(params = "") {
  return useSWR<ApiEventList>(
    `/events/${params}`,
    (path: string) => swrFetcher(path),
    { revalidateOnFocus: false },
  );
}

export function useApiArtists(params = "") {
  return useSWR<ApiArtistList>(
    `/artists/${params}`,
    (path: string) => swrFetcher(path),
    { revalidateOnFocus: false },
  );
}

export function useMyConversations() {
  return useSWR<{ results: ApiConversation[] }>(
    isAuthed() ? "/conversations/" : null,
    (path: string) => swrFetcher(path),
    { refreshInterval: 5000 },
  );
}

export function useConversationMessages(convoId: string | null) {
  return useSWR<{ results: ApiMessage[] }>(
    convoId ? `/conversations/${convoId}/messages/` : null,
    (path: string) => swrFetcher(path),
    { refreshInterval: 4000 },
  );
}

export function useMyOrders() {
  return useSWR<{ results: ApiOrder[] }>(
    isAuthed() ? "/orders/" : null,
    (path: string) => swrFetcher(path),
    { revalidateOnFocus: true },
  );
}

export function useOrderLedger(orderId: string | null) {
  return useSWR<{ results: Array<{ entry_type: string; amount: string; description: string }> }>(
    orderId ? `/orders/${orderId}/ledger/` : null,
    swrFetcher as (path: string) => Promise<{ results: Array<{ entry_type: string; amount: string; description: string }> }>,
  );
}

export function useOrderReviews(orderId: string | null) {
  return useSWR<ApiBookingReviews>(
    orderId ? `/orders/${orderId}/reviews/` : null,
    (path: string) => swrFetcher<ApiBookingReviews>(path),
  );
}
