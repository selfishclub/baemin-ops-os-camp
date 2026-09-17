"use client";

import WeekBoard from "@/components/WeekBoard";
import { STORE_LABEL, type Store } from "@/lib/types";

export default function StorePage({ store }: { store: Store }) {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">{STORE_LABEL[store]} 매장</h1>
      <WeekBoard store={store} />
    </div>
  );
}
