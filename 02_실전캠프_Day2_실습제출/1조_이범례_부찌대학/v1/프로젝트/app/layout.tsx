import type { Metadata } from "next";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "근무·급여 원터치",
  description: "근무 기록만 확인하면 직원별·사업장별 세전 급여가 한 화면에",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <DataProvider>
          <Nav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
          <footer className="px-4 py-6 text-center text-xs text-muted">
            계산은 도구가, 확인과 확정은 사장님이. · 시연용 가상 데이터
          </footer>
        </DataProvider>
      </body>
    </html>
  );
}
