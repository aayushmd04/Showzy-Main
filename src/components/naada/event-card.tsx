import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import type { NaadaEvent } from "@/data/fixtures";
import { Poster } from "./poster";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { dateListing, money } from "@/lib/format";

export function EventCard({ event, index = 0 }: { event: NaadaEvent; index?: number }) {
  const { venueOf, soldOf, capacityOf } = useStore();
  const venue = venueOf(event);
  const reduce = useReducedMotion();

  const prices = event.tiers.map((t) => t.price);
  const cheapest = Math.min(...prices);
  const soldOut = soldOf(event) >= capacityOf(event);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.32,
        delay: reduce ? 0 : Math.min(index * 0.045, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link
        to={`/e/${event.id}`}
        className="group block border border-line bg-surface transition-colors hover:border-[#3a3a45] hover:bg-surface-2"
      >
        <Poster event={event} compact className="border-0 border-b" />
        <div className="p-3">
          <p className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {dateListing(event.date)} · {event.time}
          </p>
          <h3 className="t-h3 mt-1.5 line-clamp-2 group-hover:text-signal">{event.name}</h3>
          <p className="t-small mt-1 truncate text-muted">
            {venue?.name} · {venue?.area}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="t-mono text-[15px]">
              {cheapest === 0 ? <span className="text-live">FREE</span> : money(cheapest)}
            </span>
            {soldOut && <Pill>Sold out</Pill>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
