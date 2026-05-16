import type { ReactNode } from "react";

import { Header } from "./Header";
import { Toolbar } from "./Toolbar";
import type { Tool } from "./routes";

interface Props {
  isMap: boolean;
  tool?: Tool;
  children: ReactNode;
}

export function AppShell({ isMap, tool, children }: Props) {
  return (
    <div className="flex h-screen flex-col">
      <Header isMap={isMap} />
      {isMap && tool && <Toolbar active={tool} />}
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
