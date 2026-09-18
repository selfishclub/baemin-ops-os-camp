"use client";

import ExpenseSection from "@/components/ExpenseSection";
import { useMonth } from "@/components/AppShell";
import { useLedger } from "@/components/useLedger";

// v1 주소를 그대로 열어도 되게 남겨 둔다. 화면은 올리기 탭 안에도 있다.
export default function ExpensesPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  return <ExpenseSection month={month} ledger={ledger} />;
}
