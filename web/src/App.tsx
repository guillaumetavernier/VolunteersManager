import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { IndexRoute } from "@/routes/index";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IndexRoute />
    </QueryClientProvider>
  );
}
